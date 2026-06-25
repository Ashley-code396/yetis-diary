import { SuiGrpcClient } from '@mysten/sui/grpc';
import type { Signer } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { walrus } from '@mysten/walrus';
import { bcs } from '@mysten/sui/bcs';

import { CLOCK_OBJECT_ID, SUI_NETWORK, SUI_RPC_URL, WALRUS_AGGREGATOR, WALRUS_EPOCHS, WALRUS_UPLOAD_RELAY } from './config.js';
import {
  bytesToHexString,
  hashDiaryContent,
  hashDiaryPayload,
  vectorsEqual,
} from './hash.js';
import {
  DiaryContentVerificationError,
  EMPTY_DIARY_PAYLOAD,
  type DiaryEntry,
  type DiaryOnChainState,
  type DiaryPayload,
  type EligibilityStatus,
  MAX_ENTRY_LENGTH,
  type PendingWrite,
  PENDING_WRITE_KEY,
} from './types.js';

export type YetisDiaryClient = ReturnType<typeof createYetisDiaryClient>;

export function createYetisDiaryClient(options?: {
  network?: typeof SUI_NETWORK;
  rpcUrl?: string;
}) {
  const network = options?.network ?? SUI_NETWORK;
  const baseUrl = options?.rpcUrl ?? SUI_RPC_URL;

  return new SuiGrpcClient({ network, baseUrl }).$extend(
    walrus({
      uploadRelay: {
        host: WALRUS_UPLOAD_RELAY,
        sendTip: true,
      },
    }),
  );
}

function moduleTarget(packageId: string, fn: string) {
  return `${packageId}::yetis_diary::${fn}`;
}


const TableBcs = bcs.struct('Table', {
  id: bcs.Address,
  size: bcs.u64(),
});

const DiaryBcs = bcs.struct('Diary', {
  id: bcs.Address,
  entry_count: bcs.u64(),
  last_writer: bcs.Address,
  last_written_at: bcs.u64(),
  current_blob_id: bcs.string(),
  content_hash: bcs.vector(bcs.u8()),
  queue: bcs.vector(bcs.Address),
  turn_index: bcs.u64(),
  registered: TableBcs,
  last_written_at_by_wallet: TableBcs,
});

function toUint8Array(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (Array.isArray(raw)) return new Uint8Array(raw);
  if (raw && typeof raw === 'object') {
    const keys = Object.keys(raw).map(Number).filter((k) => !isNaN(k)).sort((a, b) => a - b);
    const bytes = new Uint8Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      bytes[i] = (raw as any)[keys[i]];
    }
    return bytes;
  }
  return new Uint8Array();
}

export async function getDiaryOnChainState(
  client: YetisDiaryClient,
  diaryId: string,
): Promise<DiaryOnChainState> {
  const response = await client.core.getObject({
    objectId: diaryId,
    include: { content: true },
  });

  const obj = response.object;
  if (!obj || !obj.content || !obj.type?.includes('::Diary')) {
    throw new Error(`Diary object ${diaryId} not found or not a Move object`);
  }

  const bytes = toUint8Array(obj.content);
  const parsed = DiaryBcs.parse(bytes);

  return {
    objectId: diaryId,
    entryCount: Number(parsed.entry_count),
    lastWriter: parsed.last_writer,
    lastWrittenAt: Number(parsed.last_written_at),
    currentBlobId: parsed.current_blob_id,
    contentHash: new Uint8Array(parsed.content_hash),
    turnIndex: Number(parsed.turn_index),
    queue: parsed.queue,
  };
}

async function devInspectU64(
  client: YetisDiaryClient,
  _packageId: string,
  _target: string,
  args: (tx: Transaction) => void,
  _sender: string,
): Promise<bigint> {
  const tx = new Transaction();
  args(tx);
  const result = await (client as any).core.simulateTransaction({
    transaction: tx,
    checksEnabled: false,
    include: { commandResults: true },
  });

  if (result.$kind === 'FailedTransaction') {
    throw new Error(result.FailedTransaction.status.error?.message ?? 'simulateTransaction failed');
  }

  const returnValue = result.commandResults?.[0]?.returnValues?.[0]?.bcs;
  if (!returnValue) return 0n;

  return bcs.u64().parse(new Uint8Array(returnValue)) as unknown as bigint;
}

async function devInspectBool(
  client: YetisDiaryClient,
  _packageId: string,
  _target: string,
  args: (tx: Transaction) => void,
  _sender: string,
): Promise<boolean> {
  const tx = new Transaction();
  args(tx);
  const result = await (client as any).core.simulateTransaction({
    transaction: tx,
    checksEnabled: false,
    include: { commandResults: true },
  });

  if (result.$kind === 'FailedTransaction') {
    throw new Error(result.FailedTransaction.status.error?.message ?? 'simulateTransaction failed');
  }

  const returnValue = result.commandResults?.[0]?.returnValues?.[0]?.bcs;
  if (!returnValue) return false;

  return bcs.bool().parse(new Uint8Array(returnValue)) as unknown as boolean;
}

async function devInspectAddress(
  client: YetisDiaryClient,
  _packageId: string,
  _target: string,
  args: (tx: Transaction) => void,
  _sender: string,
): Promise<string> {
  const tx = new Transaction();
  args(tx);
  const result = await (client as any).core.simulateTransaction({
    transaction: tx,
    checksEnabled: false,
    include: { commandResults: true },
  });

  if (result.$kind === 'FailedTransaction') {
    throw new Error(result.FailedTransaction.status.error?.message ?? 'simulateTransaction failed');
  }

  const returnValue = result.commandResults?.[0]?.returnValues?.[0]?.bcs;
  if (!returnValue) return '0x0';

  return bcs.Address.parse(new Uint8Array(returnValue)) as unknown as string;
}

async function devInspectOptionU64(
  client: YetisDiaryClient,
  _packageId: string,
  _target: string,
  args: (tx: Transaction) => void,
  _sender: string,
): Promise<number | null> {
  const tx = new Transaction();
  args(tx);
  const result = await (client as any).core.simulateTransaction({
    transaction: tx,
    checksEnabled: false,
    include: { commandResults: true },
  });

  if (result.$kind === 'FailedTransaction') {
    throw new Error(result.FailedTransaction.status.error?.message ?? 'simulateTransaction failed');
  }

  const returnValue = result.commandResults?.[0]?.returnValues?.[0]?.bcs;
  if (!returnValue) return null;

  const parsed = bcs.option(bcs.u64()).parse(new Uint8Array(returnValue)) as unknown as bigint | null;
  return parsed === null ? null : Number(parsed);
}

export async function fetchWalrusBlob(blobId: string): Promise<Uint8Array> {
  const url = `${WALRUS_AGGREGATOR}/v1/blobs/${encodeURIComponent(blobId)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Walrus blob ${blobId}: ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export function parseDiaryPayload(bytes: Uint8Array): DiaryPayload {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as DiaryPayload;
  if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error('Invalid diary payload format');
  }
  return parsed;
}

export function appendEntry(
  payload: DiaryPayload,
  entry: Omit<DiaryEntry, 'index'>,
): DiaryPayload {
  return {
    version: 1,
    entries: [
      ...payload.entries,
      {
        index: payload.entries.length,
        ...entry,
      },
    ],
  };
}

export async function getFullDiary(
  client: YetisDiaryClient,
  diaryId: string,
): Promise<{
  payload: DiaryPayload;
  blobId: string;
  contentHash: Uint8Array;
  verified: true;
  onChain: DiaryOnChainState;
}> {
  const onChain = await getDiaryOnChainState(client, diaryId);

  if (!onChain.currentBlobId) {
    return {
      payload: EMPTY_DIARY_PAYLOAD,
      blobId: '',
      contentHash: onChain.contentHash,
      verified: true,
      onChain,
    };
  }

  const bytes = await fetchWalrusBlob(onChain.currentBlobId);
  const actualHash = hashDiaryContent(bytes);

  if (!vectorsEqual(actualHash, onChain.contentHash)) {
    throw new DiaryContentVerificationError(
      bytesToHexString(onChain.contentHash),
      bytesToHexString(actualHash),
    );
  }

  return {
    payload: parseDiaryPayload(bytes),
    blobId: onChain.currentBlobId,
    contentHash: onChain.contentHash,
    verified: true,
    onChain,
  };
}

export async function checkEligibility(
  client: YetisDiaryClient,
  packageId: string,
  diaryId: string,
  address: string,
): Promise<EligibilityStatus> {
  const onChain = await getDiaryOnChainState(client, diaryId);

  const registered = await devInspectBool(
    client,
    packageId,
    moduleTarget(packageId, 'is_registered'),
    (tx) => {
      tx.moveCall({
        target: moduleTarget(packageId, 'is_registered'),
        arguments: [tx.object(diaryId), tx.pure.address(address)],
      });
    },
    address,
  );

  if (!registered) {
    return { status: 'not_registered' };
  }

  const queuePosition = await devInspectOptionU64(
    client,
    packageId,
    moduleTarget(packageId, 'queue_position'),
    (tx) => {
      tx.moveCall({
        target: moduleTarget(packageId, 'queue_position'),
        arguments: [tx.object(diaryId), tx.pure.address(address)],
      });
    },
    address,
  );

  const currentTurn = await devInspectAddress(
    client,
    packageId,
    moduleTarget(packageId, 'turn_holder'),
    (tx) => {
      tx.moveCall({
        target: moduleTarget(packageId, 'turn_holder'),
        arguments: [tx.object(diaryId)],
      });
    },
    address,
  );

  const cooldownRemaining = Number(
    await devInspectU64(
      client,
      packageId,
      moduleTarget(packageId, 'cooldown_remaining_ms'),
      (tx) => {
        tx.moveCall({
          target: moduleTarget(packageId, 'cooldown_remaining_ms'),
          arguments: [tx.object(diaryId), tx.pure.address(address), tx.object(CLOCK_OBJECT_ID)],
        });
      },
      address,
    ),
  );

  if (cooldownRemaining > 0) {
    return {
      status: 'cooldown',
      remainingMs: cooldownRemaining,
      queuePosition,
    };
  }

  if (currentTurn.toLowerCase() !== address.toLowerCase()) {
    return {
      status: 'not_your_turn',
      currentTurn,
      queuePosition,
      queueLength: onChain.queue.length,
    };
  }

  return { status: 'eligible' };
}

export function buildRegisterTx(packageId: string, diaryId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: moduleTarget(packageId, 'register'),
    arguments: [tx.object(diaryId)],
  });
  return tx;
}

export function buildWriteEntryTx(
  packageId: string,
  diaryId: string,
  text: string,
  newBlobId: string,
  contentHash: Uint8Array,
): Transaction {
  if (text.length === 0) {
    throw new Error('Entry must not be empty');
  }
  if (text.length > MAX_ENTRY_LENGTH) {
    throw new Error(`Entry exceeds maximum length of ${MAX_ENTRY_LENGTH} characters`);
  }
  if (contentHash.length !== 32) {
    throw new Error('Content hash must be 32 bytes');
  }

  const tx = new Transaction();
  tx.moveCall({
    target: moduleTarget(packageId, 'write_entry'),
    arguments: [
      tx.object(diaryId),
      tx.pure.string(text),
      tx.pure.string(newBlobId),
      tx.pure.vector('u8', Array.from(contentHash)),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export function savePendingWrite(pending: PendingWrite): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(PENDING_WRITE_KEY, JSON.stringify(pending));
}

export function loadPendingWrite(): PendingWrite | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(PENDING_WRITE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingWrite;
  } catch {
    return null;
  }
}

export function clearPendingWrite(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(PENDING_WRITE_KEY);
}

export async function uploadDiaryToWalrus(
  client: YetisDiaryClient,
  payload: DiaryPayload,
  signer: Signer,
): Promise<{ blobId: string; contentHash: Uint8Array; bytes: Uint8Array }> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const contentHash = hashDiaryContent(bytes);

  const { blobId } = await (client as any).walrus.writeBlob({
    blob: bytes,
    deletable: false,
    epochs: WALRUS_EPOCHS,
    signer,
  });

  return { blobId, contentHash, bytes };
}

export async function buildWriteEntryFlow(
  client: YetisDiaryClient,
  params: {
    packageId: string;
    diaryId: string;
    text: string;
    author: string;
    signer: Signer;
  },
): Promise<{
  transaction: Transaction;
  blobId: string;
  contentHash: Uint8Array;
  payload: DiaryPayload;
}> {
  const trimmed = params.text.trim();

  // Try to get the current diary with hash verification. If hash verification
  // fails (e.g. due to a stale Walrus blob or old on-chain hash), fall
  // through to a direct fetch without verification so the user can still
  // append their entry, re-upload with the correct hash, and restore integrity.
  let currentPayload: DiaryPayload;
  try {
    ({ payload: currentPayload } = await getFullDiary(client, params.diaryId));
  } catch (error) {
    if (error instanceof DiaryContentVerificationError) {
      const onChain = await getDiaryOnChainState(client, params.diaryId);
      const bytes = await fetchWalrusBlob(onChain.currentBlobId);
      currentPayload = parseDiaryPayload(bytes);
    } else {
      throw error;
    }
  }

  const newPayload = appendEntry(currentPayload, {
    author: params.author,
    timestamp: Date.now(),
    text: trimmed,
  });

  const { blobId, contentHash } = await uploadDiaryToWalrus(
    client,
    newPayload,
    params.signer,
  );

  const transaction = buildWriteEntryTx(
    params.packageId,
    params.diaryId,
    trimmed,
    blobId,
    contentHash,
  );

  savePendingWrite({
    blobId,
    contentHash: Array.from(contentHash),
    text: trimmed,
    diaryId: params.diaryId,
    packageId: params.packageId,
  });

  return { transaction, blobId, contentHash, payload: newPayload };
}

export function buildRetryWriteEntryTx(pending: PendingWrite): Transaction {
  return buildWriteEntryTx(
    pending.packageId,
    pending.diaryId,
    pending.text,
    pending.blobId,
    new Uint8Array(pending.contentHash),
  );
}

export function encodeEmptyDiary(): { bytes: Uint8Array; contentHash: Uint8Array } {
  const bytes = new TextEncoder().encode(JSON.stringify(EMPTY_DIARY_PAYLOAD));
  return { bytes, contentHash: hashDiaryPayload(EMPTY_DIARY_PAYLOAD) };
}

export * from './types.js';
export * from './config.js';
export * from './hash.js';
