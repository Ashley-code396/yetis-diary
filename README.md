# Yeti's Diary

A collectively-authored story on Sui — turn-taking enforced on-chain, full text content stored on Walrus.

> **Live demo:** [yetis-diary.vercel.app](https://yetis-diary.vercel.app)

Each writer gets one sentence, then must wait for the next turn in the round-robin queue. No one can erase, edit, or skip ahead. The full diary is stored as a Walrus blob; the on-chain `Diary` object tracks only the blob ID and its SHA-256 content hash for integrity verification.

---

## Structure

| Directory | What it does |
|-----------|-------------|
| `move/yetis_diary/` | Move package — a shared `Diary` object with a round-robin queue, registration, turn-based write permission, and a 30-second cooldown per wallet |
| `sdk/` | TypeScript SDK — Walrus blob upload/download, on-chain state queries, eligibility checks, content hash verification, and transaction builders |
| `ui/` | Single-page React + Tailwind frontend — wallet connection via dApp Kit, diary scroll, turn status, and write form with pending-write recovery |

---




