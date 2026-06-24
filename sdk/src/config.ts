// Use globalThis to safely access environment-like values in browser/worker contexts
// when @types/node is not available during the front-end build.
const _env = (globalThis as any)?.process?.env ?? (globalThis as any)?.__env ?? {};

export const SUI_NETWORK = (_env.SUI_NETWORK ?? 'testnet') as 'testnet' | 'mainnet' | 'devnet';

export const SUI_RPC_URL =
  _env.SUI_RPC_URL ??
  (SUI_NETWORK === 'testnet'
    ? 'https://fullnode.testnet.sui.io:443'
    : SUI_NETWORK === 'mainnet'
      ? 'https://fullnode.mainnet.sui.io:443'
      : 'https://fullnode.devnet.sui.io:443');

export const WALRUS_AGGREGATOR =
  _env.WALRUS_AGGREGATOR ?? 'https://aggregator.walrus-testnet.walrus.space';

export const WALRUS_UPLOAD_RELAY =
  _env.WALRUS_UPLOAD_RELAY ?? 'https://upload-relay.testnet.walrus.space';

export const CLOCK_OBJECT_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000006';

export const COOLDOWN_MS = 86_400_000;

export const WALRUS_EPOCHS = 30;
