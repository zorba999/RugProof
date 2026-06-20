"use client";

import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

// Browser-side EVM wallet adapter for GenLayer.
// The connected wallet signs and pays for the analyze transaction itself.

export const PUBLIC_CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "") as `0x${string}`;

const BRADBURY_CHAIN_ID_HEX = `0x${testnetBradbury.id.toString(16)}`; // 4221 -> 0x107d
const BRADBURY_PARAMS = {
  chainId: BRADBURY_CHAIN_ID_HEX,
  chainName: testnetBradbury.name,
  rpcUrls: testnetBradbury.rpcUrls.default.http,
  nativeCurrency: testnetBradbury.nativeCurrency,
  blockExplorerUrls: [testnetBradbury.blockExplorers?.default.url].filter(Boolean),
};

// Turn MetaMask / RPC error objects into a readable message.
export function walletErrorMessage(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { code?: number; message?: string; data?: { message?: string } };
    if (o.code === 4001) return "You rejected the request in your wallet.";
    if (o.data?.message) return o.data.message;
    if (o.message) return o.message;
  }
  if (e instanceof Error) return e.message;
  return "Failed to connect wallet";
}

// Add / switch the wallet to the Bradbury network (no snap required).
async function ensureBradburyNetwork(eth: NonNullable<Window["ethereum"]>) {
  const current = (await eth.request({ method: "eth_chainId" })) as string;
  if (current?.toLowerCase() === BRADBURY_CHAIN_ID_HEX.toLowerCase()) return;
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BRADBURY_CHAIN_ID_HEX }],
    });
  } catch (err) {
    // 4902 = chain not added yet -> add it, then it's selected.
    const code = (err as { code?: number })?.code;
    if (code === 4902 || code === -32603) {
      await eth.request({ method: "wallet_addEthereumChain", params: [BRADBURY_PARAMS] });
    } else {
      throw err;
    }
  }
}

export type WalletSession = {
  address: `0x${string}`;
  // genlayer-js client bound to the wallet provider
  client: ReturnType<typeof createClient>;
};

export function hasWallet(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

export async function connectWallet(): Promise<WalletSession> {
  const eth = typeof window !== "undefined" ? window.ethereum : undefined;
  if (!eth) {
    throw new Error("No EVM wallet found. Please install MetaMask.");
  }

  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts || accounts.length === 0) throw new Error("No account authorized");
  const address = accounts[0] as `0x${string}`;

  // Make sure the wallet is on the Bradbury network (adds it if missing).
  await ensureBradburyNetwork(eth);

  // account as a plain address routes signing through the injected provider.
  const client = createClient({
    chain: testnetBradbury,
    account: address,
    provider: eth,
  } as Parameters<typeof createClient>[0]);

  return { address, client };
}

export async function analyzeViaWallet(
  session: WalletSession,
  p: { address: string; githubUrl: string; chain: string }
): Promise<string> {
  if (!PUBLIC_CONTRACT_ADDRESS) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured");
  }
  const txId = await session.client.writeContract({
    address: PUBLIC_CONTRACT_ADDRESS,
    functionName: "analyze",
    args: [p.address.trim(), p.githubUrl.trim(), p.chain.trim()],
    value: 0n,
  });
  return txId as string;
}

export function shortAddr(a: string): string {
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// ---- Read-only access (no wallet needed, no env account) --------------------

let _readClient: ReturnType<typeof createClient> | null = null;
function readClient() {
  if (!_readClient) _readClient = createClient({ chain: testnetBradbury });
  return _readClient;
}

const STATUS_NAMES = [
  "UNINITIALIZED", "PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED",
  "UNDETERMINED", "FINALIZED", "CANCELED", "APPEAL_REVEALING", "APPEAL_COMMITTING",
  "READY_TO_FINALIZE", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT",
];
const DONE = new Set(["ACCEPTED", "FINALIZED", "READY_TO_FINALIZE"]);
const FAILED = new Set(["CANCELED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT", "UNDETERMINED"]);

function normalizeStatus(s: unknown): string {
  if (typeof s === "number") return STATUS_NAMES[s] ?? "PENDING";
  if (typeof s === "string") return s;
  return "PENDING";
}

export async function getTxStatus(txId: string): Promise<{ status: string; done: boolean; failed: boolean }> {
  try {
    const tx = await readClient().getTransaction({ hash: txId as never });
    const status = normalizeStatus((tx as { status?: unknown })?.status);
    return { status, done: DONE.has(status), failed: FAILED.has(status) };
  } catch {
    return { status: "PENDING", done: false, failed: false };
  }
}

export type Verdict = {
  verdict?: "SAFE" | "RISKY" | "SCAM";
  score?: number;
  source_match?: "MATCH" | "MISMATCH" | "UNVERIFIED";
  flags?: string[];
  summary?: string;
};

function parseVerdict(raw: string): Verdict | null {
  try {
    return JSON.parse(raw) as Verdict;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Verdict;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function getReport(
  address: string
): Promise<{ ready: boolean; report: Verdict | null; raw: string }> {
  if (!PUBLIC_CONTRACT_ADDRESS) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured");
  const raw = (await readClient().readContract({
    address: PUBLIC_CONTRACT_ADDRESS,
    functionName: "get_report",
    args: [address.trim()],
  })) as string;
  if (!raw || raw.trim() === "") return { ready: false, report: null, raw: "" };
  return { ready: true, report: parseVerdict(raw), raw };
}
