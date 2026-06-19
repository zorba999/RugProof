import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

// Server-only module. The private key lives here and must never reach the browser.
let _client: ReturnType<typeof createClient> | null = null;
let _account: ReturnType<typeof createAccount> | null = null;

export function getAccount() {
  if (_account) return _account;
  const pk = process.env.GENLAYER_PRIVATE_KEY;
  if (!pk) throw new Error("GENLAYER_PRIVATE_KEY is not set");
  _account = createAccount(pk as `0x${string}`);
  return _account;
}

export function getClient() {
  if (_client) return _client;
  _client = createClient({ chain: testnetBradbury, account: getAccount() });
  return _client;
}

export function getContractAddress(): `0x${string}` {
  const addr = process.env.CONTRACT_ADDRESS;
  if (!addr) throw new Error("CONTRACT_ADDRESS is not set");
  return addr as `0x${string}`;
}
