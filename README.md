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

The dapp is **wallet-driven** — the user's connected EVM wallet (MetaMask + the GenLayer
snap) signs and pays for the analysis. There is no server-side account in the request path.

```
Browser + EVM wallet ──(writeContract: analyze, user-signed)──► RugProof contract
        ▲                                                              │  web + AI + consensus
        └───────────(readContract: get_report, public RPC)────────────┘
```

- `contracts/rugproof.py` — the GenLayer intelligent contract.
- `scripts/deploy.mjs` — deploy it to the Bradbury testnet (uses a funded key locally).
- `src/lib/wallet.ts` — EVM wallet adapter: connect, network switch, submit, read.
- `src/app/page.tsx` — the UI.

---

## Run locally

```bash
npm install
cp .env.example .env.local   # fill GENLAYER_PRIVATE_KEY (for deploying only)
npm run deploy:contract      # deploys the contract, writes the address into .env.local
npm run dev                  # http://localhost:3000
```

After deploy, make sure `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env.local` matches the
deployed address (the app reads this in the browser).

### Try it

1. Click **Connect Wallet** (MetaMask). It adds the Bradbury network and the GenLayer snap.
2. Make sure the wallet has some Bradbury **GEN** for gas (GenLayer faucet/portal).
3. Enter a contract address, the raw GitHub `.sol` URL, pick the chain, and **Scan**.
4. Confirm the transaction in your wallet.

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it on [Vercel](https://vercel.com).
3. Add **Environment Variable**:
   - `NEXT_PUBLIC_CONTRACT_ADDRESS` — the deployed RugProof address.
4. Deploy.

> The app no longer uses any server-side account — all contract interaction is done by
> the user's connected wallet. `GENLAYER_PRIVATE_KEY` is only needed locally to run
> `npm run deploy:contract`, and must never be committed.

---

## Tech

- [GenLayer](https://docs.genlayer.com/) intelligent contracts (Python) + `genlayer-js` SDK
- Bradbury testnet (chain id `4221`)
- Next.js (App Router), deployable on Vercel
- [Sourcify](https://sourcify.dev) for keyless verified-source lookups
