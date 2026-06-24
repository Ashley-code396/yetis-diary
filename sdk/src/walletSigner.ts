import type { ClientWithCoreApi } from '@mysten/sui/client';
import type { SuiClientTypes } from '@mysten/sui/client';
import { Signer } from '@mysten/sui/cryptography';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

type DAppKitTxResult = SuiClientTypes.TransactionResult<{
  transaction: true;
  effects: true;
}>;

export type WalletSignAndExecuteFn = (
  transaction: Transaction,
) => Promise<DAppKitTxResult>;

/**
 * Adapts dApp Kit wallet signing to the Walrus SDK Signer interface.
 */
export class WalletSigner extends Signer {
  readonly #address: string;
  readonly #signAndExecute: WalletSignAndExecuteFn;

  constructor(address: string, signAndExecute: WalletSignAndExecuteFn) {
    super();
    this.#address = address;
    this.#signAndExecute = signAndExecute;
  }

  toSuiAddress(): string {
    return this.#address;
  }

  getKeyScheme() {
    return 'ED25519' as const;
  }

  getPublicKey(): Ed25519PublicKey {
    return new Ed25519PublicKey(new Uint8Array(32));
  }

  async sign(): Promise<Uint8Array<ArrayBuffer>> {
    throw new Error('WalletSigner does not support raw sign()');
  }

  async signAndExecuteTransaction({
    transaction,
  }: {
    transaction: Transaction;
    client: ClientWithCoreApi;
  }): Promise<DAppKitTxResult> {
    transaction.setSenderIfNotSet(this.#address);
    const result = await this.#signAndExecute(transaction);

    // Walrus SDK reads `.FailedTransaction` / `.Transaction` at runtime (flat shape).
    if (result.$kind === 'FailedTransaction') {
      return {
        FailedTransaction: result.FailedTransaction,
      } as unknown as DAppKitTxResult;
    }

    return { Transaction: result.Transaction } as unknown as DAppKitTxResult;
  }
}

export function createWalletSigner(
  address: string,
  signAndExecute: WalletSignAndExecuteFn,
): WalletSigner {
  return new WalletSigner(address, signAndExecute);
}
