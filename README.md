# Yeti's Diary

A collectively-authored story on Sui — turn-taking on-chain, full text on Walrus.

## Structure

- `move/yetis_diary/` — Move package (round-robin queue + cooldown)
- `sdk/` — TypeScript SDK (Walrus + hash verification + eligibility)
- `ui/` — Single-page React + Tailwind frontend
- `scripts/publish-and-init.ts` — Testnet deploy helper

## Prerequisites

- Sui CLI 1.66+ with testnet active address and gas
- Node.js 20+
- WAL tokens on testnet for Walrus storage (writer pays per entry)

## Deploy to testnet

```bash
sui client switch --env testnet
npm install --prefix sdk
npm install --prefix ui
npx tsx scripts/publish-and-init.ts
```

This publishes the Move package, uploads the genesis Walrus blob, creates the shared `Diary`, and writes `ui/.env`.

## Run the frontend

```bash
cd ui && npm run dev
```

Open http://localhost:5173 — connect wallet, register, wait your turn, write.

## Move tests

```bash
cd move/yetis_diary && sui move test
```

## Design notes

See [PLAN.md](./PLAN.md) for turn-taking rationale, Walrus blob model, and abuse vectors.
