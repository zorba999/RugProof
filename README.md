# 🛡️ RugProof

**AI rug-pull scanner built on [GenLayer](https://genlayer.com) intelligent contracts.**

RugProof answers a question a normal smart contract can't: _does the code a project
publishes on GitHub actually match what is deployed on-chain — and is it free of
rug-pull backdoors?_

A GenLayer **intelligent contract** does the work on a decentralized validator network:

1. Fetches the **source published on GitHub** (live web access).
2. Fetches the **verified on-chain source** from Sourcify (no API key needed).
3. An **AI auditor** compares them and hunts for rug-pull patterns (hidden mint, owner
   drain, honeypot, pausable transfers, upgradeable proxy, ownership not renounced…).
4. Multiple validators reach **consensus** on a verdict so no single AI can be tricked.

Output: `verdict` (SAFE / RISKY / SCAM), a `score` 0–100, `source_match`, and concrete `flags`.

---

## Architecture

```
Browser ──► /api/analyze ─(writeContract: analyze)─► RugProof contract ──► web + AI + consensus
   ▲                                                        │
   └──── /api/report ◄─(readContract: get_report)───────────┘
```

The faucet **private key lives only server-side** (Next.js API routes). The browser
never sees it.

- `contracts/rugproof.py` — the GenLayer intelligent contract.
- `scripts/deploy.mjs` — deploy it to the Bradbury testnet.
- `src/app/api/*` — server routes that talk to GenLayer with the faucet account.
- `src/app/page.tsx` — the UI.

---

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in GENLAYER_PRIVATE_KEY
npm run deploy:contract      # deploys the contract, writes CONTRACT_ADDRESS into .env.local
npm run dev                  # http://localhost:3000
```

### Try it

- Contract address: any verified token, e.g. on Ethereum
- GitHub URL: the raw `.sol` file the project claims to have deployed
- Chain: pick the network

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it on [Vercel](https://vercel.com).
3. Add **Environment Variables**:
   - `GENLAYER_PRIVATE_KEY` — the funded Bradbury faucet key (Production + Preview).
   - `CONTRACT_ADDRESS` — the deployed RugProof address (from `npm run deploy:contract`).
4. Deploy.

> ⚠️ The private key controls testnet funds. Keep it only in `.env.local` (gitignored)
> and in Vercel env vars. Never commit it.

---

## Tech

- [GenLayer](https://docs.genlayer.com/) intelligent contracts (Python) + `genlayer-js` SDK
- Bradbury testnet (chain id `4221`)
- Next.js (App Router), deployable on Vercel
- [Sourcify](https://sourcify.dev) for keyless verified-source lookups
