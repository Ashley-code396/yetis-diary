#!/usr/bin/env -S npx tsx
// @ts-nocheck
/**
 * Publish yetis_diary to testnet, upload genesis Walrus blob, and call setup().
 *
 * Usage (from repo root):
 *   npm install
 *   npx tsx scripts/publish-and-init.ts
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { walrus } from '@mysten/walrus';
import { encodeEmptyDiary, EMPTY_DIARY_PAYLOAD } from '../sdk/src/yetisDiary.js';

// Determine the repository root relative to this script file
const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');
const MOVE_DIR = join(ROOT, 'move/yetis_diary');

function loadActiveKeypair(): Ed25519Keypair {
  const activeAddress = String(execWithAgentEnv('sui client active-address', { encoding: 'utf8' })).trim();

  // The sui CLI has changed its keytool flags across versions. Try the newer
  // `--key-identity` flag first, then fall back to the older `--address` if needed.
  let exportOutput: string | null = null;
  try {
    exportOutput = String(
      execWithAgentEnv(`sui keytool export --key-identity ${activeAddress} --json`, { encoding: 'utf8' }),
    );
  } catch (err) {
    // fallback to older flag
    exportOutput = String(
      execWithAgentEnv(`sui keytool export --address ${activeAddress} --json`, { encoding: 'utf8' }),
    );
  }

  const exportJson = JSON.parse(exportOutput) as { exportedPrivateKey: string };
  // The CLI returns a Bech32-encoded Sui private key string (starting with `suiprivkey...`).
  // The SDK's Ed25519Keypair.fromSecretKey accepts that string directly.
  return Ed25519Keypair.fromSecretKey(exportJson.exportedPrivateKey);
}

// Helper to ensure CLI commands prefer the agent skills folder
function execWithAgentEnv(cmd: string, opts: { cwd?: string; encoding?: 'utf8'; stdio?: any } = {}) {
  const env = { ...(process.env as Record<string, string | undefined>) };
  const agentBin = join(process.env.HOME ?? '~', 'agent', 'skills');
  // Prepend agentBin to PATH so agent-provided tools are preferred when present
  env.PATH = `${agentBin}:${env.PATH ?? ''}`;
  return execSync(cmd, { ...opts, env, cwd: opts.cwd, stdio: opts.stdio, encoding: opts.encoding });
}

async function main() {
  console.log('Building Move package…');
  execWithAgentEnv('sui move build', { cwd: MOVE_DIR, stdio: 'inherit' });

  console.log('Publishing Move package to testnet…');
  let packageId: string | undefined;
  let setupCapId: string | undefined;
  try {
    const publishOutput = String(
      execWithAgentEnv('sui client publish --gas-budget 200000000 --json', {
        cwd: MOVE_DIR,
        encoding: 'utf8',
      }),
    );
    const publishResult = JSON.parse(publishOutput) as {
      objectChanges?: Array<{ type?: string; packageId?: string; objectType?: string; objectId?: string }>;
      digest?: string;
    };

    packageId = publishResult.objectChanges?.find((c) => c.type === 'published')?.packageId;
    setupCapId = publishResult.objectChanges?.find(
      (c) => c.type === 'created' && c.objectType?.includes('SetupCap'),
    )?.objectId;
  } catch (err: any) {
    // If the package is already published, the CLI will return a helpful message but exit non-zero.
    const stdout = String(err?.stdout ?? '');
    if (stdout.includes('Your package is already published')) {
      // Read Published.toml for the environment
      try {
        const toml = String(execWithAgentEnv('cat Published.toml', { cwd: MOVE_DIR, encoding: 'utf8' }));
        const m = toml.match(/published\.testnet\][\s\S]*?published-at = "(0x[0-9a-fA-F]+)"/);
        if (m) packageId = m[1];
      } catch (e) {
        // ignore
      }
      // SetupCap may not be present in Published.toml; require manual setup in that case.
    } else {
      throw err;
    }
  }

  if (!packageId) {
    throw new Error('Failed to parse publish output: packageId not found');
  }

  console.log('Package ID:', packageId);

  if (!setupCapId) {
    console.warn(
      'No SetupCap ID found. This likely means the package was previously published and setup was already performed, or the publish output did not include a SetupCap.\n' +
        'The script will write ui/.env with the package ID and exit. If you need to run setup now, run the setup Move call manually with the appropriate SetupCap or re-publish with a fresh pubfile.',
    );
    writeEnv(packageId, '');
    process.exit(0);
  }

  console.log('SetupCap ID:', setupCapId);

  const signer = loadActiveKeypair();
  const client = new SuiGrpcClient({
    network: 'testnet',
    baseUrl: 'https://fullnode.testnet.sui.io:443',
  }).$extend(
    walrus({
      uploadRelay: {
        host: 'https://upload-relay.testnet.walrus.space',
      },
    }),
  );

  const { bytes, contentHash } = encodeEmptyDiary();
  console.log('Uploading genesis Walrus blob…');
  let blobId: string;
  try {
    const res = await (client as any).walrus.writeBlob({
      blob: bytes,
      deletable: false,
      epochs: 30,
      signer,
    });
    blobId = res.blobId;
  } catch (err: any) {
    console.warn('SDK Walrus upload failed, falling back to Walrus CLI…');
    const genesisJson = JSON.stringify(EMPTY_DIARY_PAYLOAD);
    const tmpFile = `/tmp/genesis-${Date.now()}.json`;
    writeFileSync(tmpFile, genesisJson);
    try {
      const storeOutput = execSync(`walrus store --epochs 30 "${tmpFile}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const blobIdMatch = storeOutput.match(/Blob ID:\s*(\S+)/);
      if (!blobIdMatch) throw new Error('Could not parse Blob ID from walrus CLI output');
      blobId = blobIdMatch[1];
    } finally {
      try { execSync(`rm -f "${tmpFile}"`); } catch {}
    }
  }
  console.log('Genesis blob ID:', blobId);

  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::yetis_diary::setup`,
    arguments: [
      tx.object(setupCapId),
      tx.pure.string(blobId),
      tx.pure.vector('u8', Array.from(contentHash)),
    ],
  });

  const signed = await tx.sign({ client, signer });
  // executeTransactionBlock may have different method names across client versions; use any to avoid type errors
  const execResult = await (client as any).core.executeTransactionBlock({
    transactionBlock: signed.bytes,
    signature: signed.signature,
  });

  if (execResult.$kind === 'FailedTransaction') {
    throw new Error(execResult.FailedTransaction.status.error?.message ?? 'Setup transaction failed');
  }

  const digest = execResult.Transaction.digest;
  await client.core.waitForTransaction({ digest });

  const txDetails = await (client as any).core.getTransaction({
    digest,
    include: { objectChanges: true },
  });

  const diaryChange = (txDetails as any).transaction?.effects?.objectChanges?.find(
    (c: any) => c.type === 'created' && 'objectType' in c && String((c as any).objectType).includes('Diary'),
  );

  if (!diaryChange || !('objectId' in diaryChange)) {
    throw new Error('Failed to find Diary object ID in setup transaction');
  }

  const diaryId = diaryChange.objectId as string;
  writeEnv(packageId, diaryId);
  console.log('Diary ID:', diaryId);
}

function writeEnv(packageId: string, diaryId: string) {
  const content = `VITE_PACKAGE_ID=${packageId}\nVITE_DIARY_ID=${diaryId}\n`;
  writeFileSync(join(ROOT, 'ui/.env'), content);
  writeFileSync(join(ROOT, '.env.example'), content);
  console.log('Wrote ui/.env and .env.example');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
