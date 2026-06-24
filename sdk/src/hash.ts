import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

export function hashDiaryContent(bytes: Uint8Array): Uint8Array {
  return sha256(bytes);
}

export function hashDiaryPayload(payload: unknown): Uint8Array {
  const json = JSON.stringify(payload);
  return hashDiaryContent(new TextEncoder().encode(json));
}

export function bytesToHexString(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function vectorsEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
