// Deploys the RugProof intelligent contract to the GenLayer Bradbury testnet.
// Usage: node scripts/deploy.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Load env from .env.local (no extra dependency needed).
function loadEnv() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const PK = process.env.GENLAYER_PRIVATE_KEY;
if (!PK) {
  console.error("Missing GENLAYER_PRIVATE_KEY in .env.local");
  process.exit(1);
}

const code = readFileSync(join(root, "contracts", "rugproof.py"), "utf-8");

const account = createAccount(PK);
const client = createClient({ chain: testnetBradbury, account });

console.log("Deployer:", account.address);
const bal = await client.getBalance({ address: account.address });
console.log("Balance :", (Number(bal) / 1e18).toFixed(4), "GEN");

console.log("\nDeploying RugProof...");
const txHash = await client.deployContract({
  account,
  code,
  args: [],
});
console.log("Deploy tx:", txHash);

console.log("Waiting for finalization (this can take a minute)...");
const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  status: TransactionStatus.FINALIZED,
  retries: 200,
  interval: 5000,
});

// Dump the full receipt for inspection (bigint-safe).
const bigintReplacer = (_k, v) => (typeof v === "bigint" ? v.toString() : v);
writeFileSync(join(root, "receipt.json"), JSON.stringify(receipt, bigintReplacer, 2));
console.log("Wrote full receipt to receipt.json");
console.log("Receipt top-level keys:", Object.keys(receipt || {}));
console.log("Receipt status:", receipt?.status);

// Recursively find a key that looks like the deployed contract address.
function findAddress(obj, seen = new Set()) {
  if (!obj || typeof obj !== "object" || seen.has(obj)) return null;
  seen.add(obj);
  for (const [k, v] of Object.entries(obj)) {
    if (
      typeof v === "string" &&
      /^0x[0-9a-fA-F]{40}$/.test(v) &&
      /contract|deployed|recipient|to|address/i.test(k) &&
      v.toLowerCase() !== account.address.toLowerCase()
    ) {
      return { key: k, value: v };
    }
  }
  for (const v of Object.values(obj)) {
    const found = findAddress(v, seen);
    if (found) return found;
  }
  return null;
}

const explicit =
  receipt?.data?.contract_address ||
  receipt?.contract_address ||
  receipt?.contractAddress ||
  receipt?.data?.contractAddress ||
  receipt?.deployed_contract_address;
const scanned = findAddress(receipt);
const addr = explicit || scanned?.value;
if (scanned) console.log("Scanned candidate:", scanned.key, "=", scanned.value);

if (!addr) {
  throw new Error("Could not find deployed contract address — inspect receipt.json.");
}

console.log("\n✅ RugProof deployed at:", addr);

// Persist the address into .env.local so the app picks it up.
const envPath = join(root, ".env.local");
let env = readFileSync(envPath, "utf-8");
if (/^CONTRACT_ADDRESS=.*$/m.test(env)) {
  env = env.replace(/^CONTRACT_ADDRESS=.*$/m, `CONTRACT_ADDRESS=${addr}`);
} else {
  env += `\nCONTRACT_ADDRESS=${addr}\n`;
}
writeFileSync(envPath, env);
console.log("Saved CONTRACT_ADDRESS to .env.local");
console.log("\nFor Vercel, set these env vars:");
console.log("  GENLAYER_PRIVATE_KEY = (your key)");
console.log("  CONTRACT_ADDRESS     =", addr);
