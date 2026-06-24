# Yeti's Diary — Implementation Plan

> **Status:** Approved — implementation in progress.

---

## Executive summary

Yeti's Diary is a shared, immutable, collectively-authored story stored on Sui with full text on Walrus. Turn-taking uses a **round-robin writer queue with per-wallet cooldown re-entry**. Each Walrus update is a **new immutable blob** (Walrus has no append API). The connected writer's wallet pays for and triggers Walrus storage; the frontend never displays unverified Walrus content.

---

## 1. Turn-taking mechanism — chosen design

### Decision: **Round-robin queue + per-wallet cooldown (hybrid)**

| Mechanism | Verdict | Reasoning |
|-----------|---------|-----------|
| **Cooldown-per-wallet only** | ❌ Rejected | Any wallet can write whenever cooldown expires → concurrent writers, race conditions, and unreadable noise at scale. No notion of "your turn." |
| **Round-robin queue** | ✅ Core | Exactly one eligible writer at a time. Deterministic, auditable on-chain, demo-friendly ("You're #12, currently #3's turn"). |
| **Random eligible wallet** | ❌ Rejected | Sui `Random` (validator-sourced) is viable but adds complexity, unpredictable UX ("maybe never picked"), and harder 3-minute demo narrative. |
| **Stake-to-write** | ❌ Rejected as primary | Raises spam cost but doesn't enforce sequential storytelling. Sybil stake is cheap on testnet. Excludes wallets without SUI. Better as optional future hardening. |

### How it works

1. **`register(diary, ctx)`** — Wallet joins the queue **once** (idempotent). Appended to `queue: vector<address>`. Recorded in `registered: Table<address, bool>`.
2. **`write_entry(diary, text, new_blob_id, new_content_hash, clock, ctx)`** — Only the wallet at `queue[turn_index % queue.length()]` may write, **and** only if their personal cooldown has elapsed since their last entry.
3. **After a successful write** — `turn_index` increments (mod queue length), writer's `last_written_at[author]` updates, `entry_count` increments, blob pointer/hash update, `EntryAdded` event emits.
4. **Re-entry** — Writers remain in the queue permanently after registering. After cooldown (default **24 hours**), they become eligible again when the round-robin pointer reaches them.

This satisfies "one entry when it's your turn" while allowing the story to grow indefinitely as the queue cycles.

### On-chain `Diary` state (beyond spec minimum)

```move
public struct Diary has key {
    id: UID,
    entry_count: u64,
    last_writer: address,
    last_written_at: u64,           // global timestamp of last entry (epoch ms)
    current_blob_id: String,
    content_hash: vector<u8>,         // SHA-256 of full Walrus JSON payload
    queue: vector<address>,          // FIFO round-robin order
    turn_index: u64,                 // absolute counter; current = turn_index % queue.length()
    registered: Table<address, bool>,
    last_written_at_by_wallet: Table<address, u64>,  // per-wallet cooldown tracking
}
```

Constants (module-level, not user-configurable in v1):

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_ENTRY_LENGTH` | **280** characters | One sentence / short passage. Validated via `text.length()` on-chain. |
| `COOLDOWN_MS` | **86_400_000** (24 h) | Prevents same wallet dominating every rotation. |
| `MIN_ENTRY_LENGTH` | **1** | Reject empty entries (`EEmptyEntry`). |

### Abort codes (real, named)

| Code | Constant | When |
|------|----------|------|
| 1 | `ENotRegistered` | Writer never called `register` |
| 2 | `ENotYourTurn` | Caller ≠ current queue head |
| 3 | `ETooSoon` | Per-wallet cooldown not elapsed |
| 4 | `EEntryTooLong` | `text.length() > MAX_ENTRY_LENGTH` |
| 5 | `EEmptyEntry` | `text.length() == 0` |
| 6 | `EQueueEmpty` | No registered writers (edge case at init) |
| 7 | `EInvalidContentHash` | Hash length ≠ 32 bytes |
| 8 | `EStaleBlobId` | `new_blob_id` equals current (must change each write) |

---

## 2. Max entry length — 280 characters

**Why 280:**

- Matches "a sentence or short passage" without allowing paragraph spam.
- Cheap on-chain validation (`string::length`).
- ~280 UTF-8 bytes keeps Walrus blob growth modest for hundreds of entries.
- Familiar mental model (classic microblog limit) for hackathon judges.

Frontend mirrors the limit with a live character counter; Move enforces it regardless of client.

---

## 3. Content safety — what we enforce vs. explicitly do not

### Enforced on-chain

- Maximum length (280 chars)
- Minimum length (1 char, non-empty)
- Turn order (round-robin)
- Rate limit (24 h cooldown per wallet between entries)
- One registration per address
- Content integrity pointer (`content_hash` must change; hash must be 32 bytes)

### Enforced off-chain (client / SDK, not Move)

- UTF-8 encoding validation before hash
- Walrus fetch hash verification before display (see §6)
- Trim leading/trailing whitespace before submit (client convenience; on-chain stores as submitted)

### Explicitly NOT attempting

- **Semantic content moderation** — Move cannot inspect meaning, detect profanity, or judge quality.
- **Censorship or deletion** — past blob versions remain on Walrus until expiry; on-chain history is append-only via pointer updates.
- **Sybil identity verification** — any wallet can register; we do not KYC.
- **Guaranteed liveness** — if the current turn-holder never writes, the queue stalls (see §7).

We will state plainly in the UI README/tagline area that the diary is **uncensored and unmoderated** except for structural limits.

---

## 4. Walrus content model — confirmed behavior

### Walrus does NOT support append or in-place update

Per [Walrus storing blobs docs](https://docs.wal.app/docs/walrus-client/storing-blobs):

- Blobs are **immutable** and **content-addressed** (blob ID derived from content).
- To "update" the diary, the client **uploads a new blob** containing the full updated document and updates the on-chain pointer.
- `extend` only prolongs storage duration of an **existing** blob object — it does not modify content.
- Prior blob versions remain retrievable on Walrus until their storage epochs expire (orphaned but harmless).

### Walrus payload format (JSON, versioned)

```json
{
  "version": 1,
  "entries": [
    {
      "index": 0,
      "author": "0xabc…",
      "timestamp": 1719230400000,
      "text": "In the beginning, the yeti found a blank page."
    }
  ]
}
```

- **Source of truth:** latest `current_blob_id` on `Diary` + verified `content_hash`.
- **`EntryAdded` event:** notification / live-feed only. Frontend may use it to trigger re-fetch, but never reconstructs full diary from events alone.

### Who pays and triggers Walrus writes

| Actor | Responsibility |
|-------|----------------|
| **Writer's connected wallet** | Pays WAL/SUI storage fees via `@mysten/walrus` `writeBlob` (with upload relay in browser). Signs Walrus register/certify transactions. |
| **No backend / relayer** | Keeps scope lean; aligns with "nobody owns it." Writer bears marginal storage cost (~small JSON blob per entry). |

**Browser flow:** `@mysten/walrus` with **upload relay** (per [Walrus SDK docs](https://sdk.mystenlabs.com/walrus) and relay example app) to avoid ~220 direct node requests from the browser.

**Storage duration:** `--epochs 30` minimum on testnet (per Walrus Sites skill guidance) to avoid early expiry during demo/hackathon period.

**Blob permanence:** `deletable: false` (permanent until epoch expiry) so entries can't be unilaterally deleted by uploader.

### Write-then-confirm sequencing (Walrus ↔ Move)

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ 1. READ     │────▶│ 2. APPEND local  │────▶│ 3. SHA-256 hash     │
│ current blob│     │ new entry to JSON│     │ full payload bytes  │
└─────────────┘     └──────────────────┘     └──────────┬──────────┘
                                                          │
┌─────────────┐     ┌──────────────────┐                  ▼
│ 6. UI poll  │◀────│ 5. MOVE tx       │◀────┌─────────────────────┐
│ re-fetch    │     │ write_entry(...) │     │ 4. WALRUS writeBlob │
└─────────────┘     └──────────────────┘     │ (wallet signs)      │
                                             └─────────────────────┘
```

**Order:** Walrus upload **before** Move transaction (Move needs `new_blob_id` + `new_content_hash`).

| Failure mode | Handling |
|--------------|----------|
| **Walrus succeeds, Move fails** | Orphan blob on Walrus (content-addressed, harmless). SDK caches `{ newBlobId, contentHash, appendedBytes }` in sessionStorage. UI shows "Retry on-chain confirm" — resubmit Move tx with same blob_id/hash without re-uploading. |
| **Walrus fails** | Abort before Move. No on-chain state change. User retries upload. |
| **Move succeeds, fetch fails** | On-chain pointer updated. Poll/retry Walrus read. Hash verification will pass once aggregator serves new blob. |

Move validates `new_blob_id != diary.current_blob_id` and hash length to prevent no-op / garbage updates. It does **not** re-hash Walrus content (Move cannot read Walrus).

### Genesis blob

At deploy/publish time, deploy script uploads initial empty JSON (`{"version":1,"entries":[]}`) to Walrus and passes blob ID + hash into `init`/`create_diary` so the shared `Diary` object starts with valid pointers.

---

## 5. Content hash verification — end-to-end

| Step | Where | Action |
|------|-------|--------|
| 1 | SDK `buildWriteEntryTx` | `contentHash = SHA-256(UTF-8 bytes of full JSON)` via Web Crypto / `@noble/hashes` |
| 2 | Move `write_entry` | Stores `new_content_hash: vector<u8>` (must be exactly 32 bytes) |
| 3 | SDK `getFullDiary` | Fetch blob from Walrus aggregator → compute SHA-256 → compare to on-chain `content_hash` |
| 4 | Mismatch | Throw `DiaryContentVerificationError` with both hashes; **frontend must not render body text** |

Frontend `useDiary` hook surfaces verification errors as a prominent warning banner, not silent fallback.

---

## 6. Remaining abuse / spam vectors (honest assessment)

| Vector | Mitigation | Residual risk |
|--------|------------|---------------|
| **Sybil wallets** | Round-robin + 24 h cooldown limits throughput to ~1 entry per wallet per day | Attacker with N wallets → N entries/day, still sequential |
| **Queue stuffing** | Registration is cheap; large queue slows rotation | Demo/testnet griefing possible |
| **Turn stalling** | Current turn-holder never writes → **queue frozen** | No timeout skip in v1 (acceptable hackathon tradeoff; document as known limitation) |
| **Offensive content** | None on-chain | Uncensored by design |
| **Walrus blob expiry** | 30+ epochs on upload | If not renewed, old snapshots become unreadable (mitigate with generous epochs) |
| **Orphan blobs** | Content-addressed | Storage cost leak on failed Move tx, not a integrity issue |
| **Hash mismatch / MITM aggregator** | Client-side hash verify | User sees error, not corrupted story |
| **Front-running blob ID** | Move checks caller eligibility + blob ID change | Theoretically someone could upload same content (same blob ID) but can't pass eligibility check to commit it |

---

## 7. Move module API

### `yetis_diary::yetis_diary`

**Init:** Creates shared `Diary` with genesis blob pointer (via publish PTB or admin one-shot — see deploy script).

**Public functions:**

```move
public fun register(diary: &mut Diary, ctx: &TxContext);
public fun write_entry(
    diary: &mut Diary,
    text: String,
    new_blob_id: String,
    new_content_hash: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
);
public fun create_diary(/* genesis params, called once from init */): Diary;
```

**Event:**

```move
public struct EntryAdded has copy, drop {
    entry_index: u64,
    author: address,
    blob_id: String,
    timestamp: u64,
}
```

**View helpers (for SDK eligibility checks via dev inspect or object fields):**

- `turn_holder(diary: &Diary): address`
- `queue_length(diary: &Diary): u64`
- `queue_position(diary: &Diary, addr: address): Option<u64>`
- `is_registered(diary: &Diary, addr: address): bool`
- `cooldown_remaining_ms(diary: &Diary, addr: address, clock: &Clock): u64`

### Tests (`tests/yetis_diary_tests.move`)

| Test | Asserts |
|------|---------|
| `test_registered_wallet_can_write` | Registered head-of-queue writes successfully |
| `test_unregistered_wallet_rejected` | `ENotRegistered` |
| `test_wrong_turn_rejected` | Second wallet aborts `ENotYourTurn` |
| `test_overlength_entry_rejected` | 281-char string aborts `EEntryTooLong` |
| `test_turn_advances_after_write` | Same wallet immediate re-write aborts `ENotYourTurn` |
| `test_cooldown_enforced` | Same wallet after turn returns aborts `ETooSoon` until clock advances |

Tests use `sui::test_scenario` + `sui::clock::Clock` test helper. Walrus is **not** mocked in Move tests — blob ID/hash are dummy valid values.

---

## 8. TypeScript SDK (`sdk/`)

### Dependencies

```json
{
  "@mysten/sui": "^1.x (latest stable)",
  "@mysten/walrus": "^1.1.0",
  "@noble/hashes": "^1.x"
}
```

### Environment

```bash
SUI_NETWORK=testnet
SUI_RPC_URL=https://fullnode.testnet.sui.io:443   # default if unset
WALRUS_AGGREGATOR=https://aggregator.walrus-testnet.walrus.space
```

Uses `SuiGrpcClient` + `.extend(walrus({ uploadRelay: { host: 'https://upload-relay.testnet.walrus.space' } }))`.

### Exported API

```typescript
// Registration
registerWriter(client, { packageId, diaryId, signer }): Promise<TransactionResult>

// Write flow (orchestrates Walrus + Move)
buildWriteEntryTx(client, {
  packageId, diaryId, text, signer,
  currentBlobId, currentEntries,  // from getFullDiary
}): Promise<{ walrusBlobId, contentHash, transaction: Transaction }>

executeWriteEntry(client, signer, params): Promise<{ digest, blobId }>
// Full flow: read → append → hash → writeBlob → write_entry tx

// Read + verify
getFullDiary(client, diaryId): Promise<DiaryPayload>
// Returns { entries, blobId, contentHash, verified: true } or throws

// Eligibility (mirrors Move logic client-side)
checkEligibility(client, diaryId, address): Promise<EligibilityResult>
// { status: 'eligible' | 'not_registered' | 'not_your_turn' | 'cooldown', ... }
```

### Types

```typescript
interface DiaryEntry {
  index: number;
  author: string;
  timestamp: number;
  text: string;
}

interface DiaryPayload {
  version: 1;
  entries: DiaryEntry[];
}
```

---

## 9. Frontend (`ui/`)

Single-page React + Vite + Tailwind + `@mysten/dapp-kit-react`.

### Layout

1. **Header** — "Yeti's Diary" / tagline / `ConnectButton`
2. **DiaryScroll** — Continuous storybook prose; each entry as indented attribution (`0xabc…def · 2h ago`) then text. Parchment-toned background, serif display font (e.g. **Lora** + **Caveat** accent).
3. **TurnStatus** — Eligibility card: "It's your turn!" / "You're #7 in line" / "Cooldown: 14h 22m" / "Register to join the queue"
4. **WriteBox** — Textarea max 280, submit disabled unless eligible; shows Walrus+Move step progress
5. **Live poll** — `useQuery` every 5s on `Diary.current_blob_id`; on change → `getFullDiary` re-fetch + hash verify

### Visual tone

Warm parchment (`#F5EDD6`), ink brown text (`#3D2B1F`), soft snow accent (`#E8F4F8`), subtle yeti footprint watermark. Whimsical but readable — not a data table.

### Config (`ui/src/lib/config.ts`)

```typescript
export const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID;
export const DIARY_ID = import.meta.env.VITE_DIARY_ID;
```

---

## 10. File tree

```
Yetis-diary/
├── PLAN.md                          ← this document
├── README.md                        ← setup, deploy, demo script
├── .env.example
├── scripts/
│   └── publish-and-init.ts          ← publish Move, upload genesis blob, create Diary
├── move/
│   └── yetis_diary/
│       ├── Move.toml
│       ├── Published.toml           ← after first publish
│       ├── Move.lock
│       ├── sources/
│       │   └── yetis_diary.move
│       └── tests/
│           └── yetis_diary_tests.move
├── sdk/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── yetisDiary.ts
│       ├── types.ts
│       ├── hash.ts
│       └── config.ts
└── ui/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── lib/
        │   └── config.ts
        ├── hooks/
        │   ├── useDiary.ts
        │   └── useEligibility.ts
        └── components/
            ├── Header.tsx
            ├── DiaryScroll.tsx
            ├── TurnStatus.tsx
            └── WriteBox.tsx
```

---

## 11. Toolchain & dependency versions

| Component | Target |
|-----------|--------|
| Sui CLI | **1.66.x** (installed: 1.66.2) |
| Move edition | **2024** (auto-resolved Sui framework — no manual `Sui = { git = ... }`) |
| Move.toml environments | `testnet = "4c78adac"` |
| `@mysten/sui` | Latest **1.x** stable from npm |
| `@mysten/walrus` | **^1.1.0** |
| `@mysten/dapp-kit-react` | Latest stable |
| `@noble/hashes` | sha256 for cross-environment hash parity |
| React | 18+ |
| Vite | 6.x |
| Tailwind | 3.x |

---

## 12. Implementation order (post-approval)

1. **Part 1 — Move** — module + tests → `sui move test` green
2. **Deploy script** — publish to testnet, genesis Walrus blob, shared `Diary` ID → `.env`
3. **Part 2 — SDK** — register, write, read, eligibility against live testnet object
4. **Part 3 — Frontend** — full UI wired to SDK
5. **E2E verification** — browser subagent: connect wallet → register → write → see live update

---

## 13. 3-minute demo script (for reference)

| Time | Action |
|------|--------|
| 0:00 | Show diary scrolling — "one story, no owner" |
| 0:30 | Connect wallet, show turn status |
| 0:45 | Register (if needed) |
| 1:00 | Write one sentence → progress indicator (Walrus → chain) |
| 1:30 | Story updates live without refresh |
| 2:00 | Show shortened address attribution on new entry |
| 2:30 | Explain: Walrus holds text, Sui holds rules + hash, nobody can edit past |
| 3:00 | Done |

---

## Open questions for you

1. **Cooldown duration** — 24 h OK for hackathon, or prefer shorter (e.g. 1 h) for faster demo cycling?
2. **Turn stall** — Accept v1 freeze if turn-holder doesn't write, or add a skip-after-timeout (adds scope)?
3. **One-time vs recurring writes** — Plan assumes wallets re-enter after cooldown indefinitely. Should each wallet be limited to **one entry ever** instead?

---

**Awaiting your go-ahead to implement Part 1.**
