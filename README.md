<div align="center">

# 🛡️ RugProof

### AI-powered rug-pull scanner built on [GenLayer](https://genlayer.com)

Verify that a deployed smart contract **actually matches its public GitHub source** —
and is free of rug-pull backdoors — using a decentralized network of AI validators.

[![GenLayer](https://img.shields.io/badge/Built_on-GenLayer-5b8cff)](https://genlayer.com)
[![Network](https://img.shields.io/badge/Network-Bradbury_Testnet-7b5bff)](https://explorer-bradbury.genlayer.com)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js)](https://nextjs.org)
[![Wallet](https://img.shields.io/badge/Wallet-EVM_/_MetaMask-f6851b?logo=metamask)](https://metamask.io)

</div>

---

## The problem

One of the most common crypto scams is a **source mismatch**: a team publishes clean,
audited-looking code on GitHub, but deploys *different* bytecode on-chain — with a hidden
mint, an owner that can drain the pool, or a honeypot that lets you buy but never sell.
Investors read the GitHub repo, trust it, and ape in. Then comes the rug.

A normal smart contract **cannot** catch this: it has no internet access, can't read code,
and can't make a judgment call. Oracles only fetch data — they don't reason about it.

## The solution

RugProof is a GenLayer **intelligent contract** — a contract that can browse the web, call
an LLM, and reach **consensus** on a subjective verdict. For any target contract it:

1. 📥 Fetches the **source published on GitHub** (live web access, on-chain).
2. 🔗 Fetches the **verified on-chain source** from [Sourcify](https://sourcify.dev) (no API key).
3. 🤖 Runs an **AI security audit** comparing the two and hunting for rug-pull patterns.
4. ⚖️ Has **multiple independent validators** agree on the verdict, so no single AI can be tricked.

```jsonc
{
  "verdict": "RISKY",                // SAFE · RISKY · SCAM
  "score": 55,                       // 0–100 confidence the contract is clean
  "source_match": "MISMATCH",        // MATCH · MISMATCH · UNVERIFIED
  "flags": ["owner_can_mint", "pausable_transfers", "upgradeable_proxy"],
  "summary": "The deployed source does not match GitHub and the owner can mint freely…"
}
```

Patterns it looks for: hidden mint, owner-can-drain, honeypot (can't sell), arbitrary
fee/tax setters, transfer blacklists, pausable transfers, upgradeable proxies that let the
owner swap logic, ownership not renounced, and backdoors disguised as ordinary functions.

---

## How it works

The dapp is **fully wallet-driven** — the user's connected EVM wallet signs and pays for the
analysis transaction. There is **no server-side account** in the request path; the app is a
static front-end that talks to GenLayer directly.

```
┌─────────────┐   writeContract: analyze()    ┌──────────────────────────┐
│  Browser +  │  ── user-signed, user-paid ──► │   RugProof  (GenLayer    │
│  EVM wallet │                                │   intelligent contract)  │
│ (MetaMask)  │   readContract: get_report()   │                          │
│             │  ◄────── public RPC ────────── │  web fetch → AI → vote   │
└─────────────┘                                └────────────┬─────────────┘
                                                            │
                                  GitHub raw source ◄───────┤
                                  Sourcify verified src ◄────┘
```

| Layer | What it does |
|-------|--------------|
| `contracts/rugproof.py` | The intelligent contract: web access, AI audit, equivalence-principle consensus. |
| `src/lib/wallet.ts` | EVM wallet adapter — connect, network switch, sign & submit, read verdicts. |
| `src/app/page.tsx` | The scanner UI. |
| `scripts/deploy.mjs` | Deploys the contract to the Bradbury testnet. |

### The intelligent contract, briefly

```python
verdict = gl.eq_principle.prompt_non_comparative(
    gather,                 # fetches GitHub + Sourcify sources (runs on every validator)
    task=AUDIT_INSTRUCTIONS,    # the leader produces a JSON verdict
    criteria=ACCEPTANCE_RULES,  # validators accept it only if well-formed & plausible
)
self.reports[contract_address.lower()] = verdict
```

The **equivalence principle** is what makes a subjective "is this a scam?" decision
trustless: the leader proposes a verdict, and independent validators — running different
LLMs — must agree it is valid before it is committed on-chain.

---

## Live deployment

| | |
|--|--|
| **Network** | GenLayer Bradbury Testnet (`chainId 4221`) |
| **RugProof contract** | [`0xDBf009561A40Fa07c5d3BCC194155Acd38607581`](https://explorer-bradbury.genlayer.com/address/0xDBf009561A40Fa07c5d3BCC194155Acd38607581) |

---

## Getting started

### Prerequisites
- Node.js 20+
- [MetaMask](https://metamask.io) (for using the app)
- A GenLayer-funded key (for deploying) — get test **GEN** from the [GenLayer portal](https://portal.genlayer.foundation)

### Install & run

```bash
git clone https://github.com/zorba999/RugProof.git
cd RugProof
npm install

cp .env.example .env.local          # add GENLAYER_PRIVATE_KEY (deploy only)
npm run deploy:contract             # deploys the contract, writes the address into .env.local
npm run dev                         # http://localhost:3000
```

### Environment variables

| Variable | Used by | Description |
|----------|---------|-------------|
| `GENLAYER_PRIVATE_KEY` | `npm run deploy:contract` | A funded Bradbury key. **Local only — never commit.** |
| `CONTRACT_ADDRESS` | deploy script | Filled automatically after deploy. |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | the app (browser) | The deployed RugProof address. Filled automatically. |

---

## Usage

1. **Connect Wallet** — adds the Bradbury network to MetaMask automatically.
2. Make sure your wallet holds some Bradbury **GEN** for gas.
3. Enter a **contract address**, the **raw GitHub `.sol` URL**, pick the **chain**, and **Scan**.
4. Confirm in your wallet, then watch the consensus resolve (~30–90s).

### Try these

| Target | Address | GitHub source | Expected |
|--------|---------|---------------|----------|
| **WETH** | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` | `gnosis/canonical-weth/.../WETH9.sol` | 🟢 SAFE |
| **DAI** | `0x6B175474E89094C44Da98b954EedeAC495271d0F` | `makerdao/dss/.../src/dai.sol` | 🟡 owner-can-mint |
| **USDC** | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | `circlefin/stablecoin-evm/.../FiatTokenV1.sol` | 🔴 blacklist + pausable + proxy |

> Verdicts are AI-generated and may vary slightly per run — that's expected. Consensus
> guarantees agreement on the **verdict**, not on the exact score.

---

## Deploy to Vercel

1. Push to GitHub and import the repo on [Vercel](https://vercel.com).
2. Add one environment variable: `NEXT_PUBLIC_CONTRACT_ADDRESS` = your deployed address.
3. Deploy.

No private key is needed on Vercel — all contract interaction is done by the user's wallet.

---

## Tech stack

- **[GenLayer](https://docs.genlayer.com/)** intelligent contracts (Python) + `genlayer-js` SDK
- **Next.js 14** (App Router) — static, Vercel-ready
- **MetaMask / EVM** wallet adapter
- **[Sourcify](https://sourcify.dev)** for keyless verified-source lookups

## Roadmap

- [ ] Scan history & shareable verdict pages
- [ ] Embeddable "RugProof ✓ verified" badge
- [ ] Direct bytecode (not just verified-source) comparison
- [ ] Multi-file repo support

## Disclaimer

RugProof produces **AI-generated assessments on a testnet** and is **not financial advice**.
Always do your own research before interacting with any contract.

<div align="center">

Built on [GenLayer](https://genlayer.com) — the intelligence layer of the internet.

</div>
