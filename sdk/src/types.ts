export interface DiaryEntry {
  index: number;
  author: string;
  timestamp: number;
  text: string;
}

export interface DiaryPayload {
  version: 1;
  entries: DiaryEntry[];
}

export interface DiaryOnChainState {
  objectId: string;
  entryCount: number;
  lastWriter: string;
  lastWrittenAt: number;
  currentBlobId: string;
  contentHash: Uint8Array;
  turnIndex: number;
  queue: string[];
}

export type EligibilityStatus =
  | { status: 'eligible' }
  | { status: 'not_registered' }
  | { status: 'not_your_turn'; currentTurn: string; queuePosition: number | null; queueLength: number }
  | { status: 'cooldown'; remainingMs: number; queuePosition: number | null };

export interface PendingWrite {
  blobId: string;
  contentHash: number[];
  text: string;
  diaryId: string;
  packageId: string;
}

export class DiaryContentVerificationError extends Error {
  readonly expectedHash: string;
  readonly actualHash: string;

  constructor(expectedHash: string, actualHash: string) {
    super(
      `Diary content verification failed: on-chain hash ${expectedHash} does not match Walrus content hash ${actualHash}`,
    );
    this.name = 'DiaryContentVerificationError';
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
  }
}

export const EMPTY_DIARY_PAYLOAD: DiaryPayload = { version: 1, entries: [] };

export const MAX_ENTRY_LENGTH = 280;
export const PENDING_WRITE_KEY = 'yetis_diary_pending_write';
