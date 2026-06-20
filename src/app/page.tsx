"use client";

import { useState, useRef, useEffect } from "react";
import {
  connectWallet,
  analyzeViaWallet,
  getTxStatus,
  getReport,
  hasWallet,
  shortAddr,
  walletErrorMessage,
  type WalletSession,
  type Verdict as Report,
} from "@/lib/wallet";

const CHAINS = ["ethereum", "base", "bsc", "polygon", "arbitrum", "optimism", "avalanche"];

export default function Home() {
  const [address, setAddress] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [chain, setChain] = useState("ethereum");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [rawFallback, setRawFallback] = useState("");
  const cancelled = useRef(false);

  // Wallet adapter state
  const [walletAddr, setWalletAddr] = useState<string>("");
  const [connecting, setConnecting] = useState(false);
  const sessionRef = useRef<WalletSession | null>(null);

  useEffect(() => {
    const eth = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!eth?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const accounts = (args[0] as string[]) || [];
      if (accounts.length === 0) {
        sessionRef.current = null;
        setWalletAddr("");
      } else {
        setWalletAddr(accounts[0]);
      }
    };
    eth.on("accountsChanged", onAccounts);
    return () => eth.removeListener?.("accountsChanged", onAccounts);
  }, []);

  async function onConnect() {
    setError("");
    setConnecting(true);
    try {
      const session = await connectWallet();
      sessionRef.current = session;
      setWalletAddr(session.address);
    } catch (err) {
      setError(walletErrorMessage(err));
    } finally {
      setConnecting(false);
    }
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setReport(null);
    setRawFallback("");
    setBusy(true);
    cancelled.current = false;

    try {
      if (!sessionRef.current) {
        throw new Error("Connect your wallet first — it will sign and pay for the scan.");
      }

      // Snapshot any existing verdict for this address so we can tell when THIS
      // scan produces a fresh one (avoids showing a stale report on re-scans).
      const before = await getReport(address).catch(() => ({ raw: "" }));
      const beforeRaw = before.raw || "";

      // The connected wallet signs & pays for the transaction.
      setStage("Confirm the transaction in your wallet…");
      const txId = await analyzeViaWallet(sessionRef.current, { address, githubUrl, chain });

      setStage("Validators are auditing the contract (this takes 30–90s)…");

      // Poll the on-chain verdict until it changes from the snapshot.
      // Status polling is best-effort (just for the progress label).
      const started = Date.now();
      const TIMEOUT = 6 * 60 * 1000;
      while (!cancelled.current && Date.now() - started < TIMEOUT) {
        await sleep(4000);

        // Best-effort progress label — never let it break the loop.
        try {
          const st = await getTxStatus(txId);
          if (st.failed) throw new Error(`Consensus did not resolve (status: ${st.status}). Try again.`);
          if (!st.done) setStage(`Validators auditing… (${st.status.toLowerCase()})`);
          else setStage("Finalizing the verdict…");
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("Consensus did not resolve")) throw e;
        }

        const rep = await getReport(address).catch(() => null);
        if (rep?.ready && rep.raw !== beforeRaw) {
          if (rep.report) setReport(rep.report as Report);
          else setRawFallback(rep.raw || "");
          setStage("");
          setBusy(false);
          return;
        }
      }
      throw new Error("Timed out waiting for the verdict. The transaction may still finalize — try reading the report again shortly.");
    } catch (err) {
      setError(walletErrorMessage(err));
      setStage("");
      setBusy(false);
    }
  }

  const verdict = report?.verdict ?? "RISKY";
  const score = typeof report?.score === "number" ? report!.score : null;

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">
          <div className="logo">🛡️</div>
          <h1>RugProof</h1>
        </div>
        {walletAddr ? (
          <div className="wallet-pill" title={walletAddr}>
            <span className="dot" />
            {shortAddr(walletAddr)}
          </div>
        ) : (
          <button
            className="connect"
            type="button"
            onClick={onConnect}
            disabled={connecting || !hasWallet()}
          >
            {connecting ? "Connecting…" : hasWallet() ? "Connect Wallet" : "No wallet found"}
          </button>
        )}
      </div>
      <p className="tagline">
        Does the deployed contract really match its GitHub source — and is it free of rug-pull
        backdoors? An AI auditor reads both and gives a verdict.
      </p>
      <p className="powered">
        Powered by <b>GenLayer</b> intelligent contracts · Bradbury testnet
      </p>

      <form className="card" onSubmit={run}>
        <label>Contract address</label>
        <input
          placeholder="0x… deployed token / contract address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          spellCheck={false}
        />

        <label>GitHub source URL</label>
        <input
          placeholder="https://raw.githubusercontent.com/org/repo/main/Token.sol"
          value={githubUrl}
          onChange={(e) => setGithubUrl(e.target.value)}
          spellCheck={false}
        />
        <div className="hint">Tip: use the raw file URL of the main contract for best results.</div>

        <div className="row">
          <div>
            <label>Chain</label>
            <select value={chain} onChange={(e) => setChain(e.target.value)}>
              {CHAINS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              className="scan"
              type="submit"
              disabled={busy || !address || !githubUrl || !walletAddr}
            >
              {busy ? "Scanning…" : walletAddr ? "Scan contract" : "Connect wallet to scan"}
            </button>
          </div>
        </div>
        <div className="hint">
          {walletAddr
            ? "Your connected wallet signs & pays for this scan (needs Bradbury GEN for gas)."
            : "Connect your EVM wallet — it will sign and pay for the scan transaction."}
        </div>
      </form>

      {stage && (
        <div className="status">
          <div className="spinner" />
          <span>{stage}</span>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {report && (
        <div className="result">
          <div className={`verdict-head ${verdict}`}>
            <div className={`verdict-label ${verdict}`}>
              {verdict === "SAFE" ? "✓ " : verdict === "SCAM" ? "✕ " : "! "}
              {verdict}
            </div>
            {score !== null && (
              <div className="score">
                <span className="num" style={{ color: `var(--${verdict.toLowerCase()})` }}>
                  {score}
                </span>
                <span className="max"> / 100</span>
              </div>
            )}
          </div>
          <div className="verdict-body">
            {report.source_match && (
              <span className={`match ${report.source_match}`}>
                Source: {report.source_match}
              </span>
            )}
            {report.summary && <p className="summary">{report.summary}</p>}

            <div className="flags-title">Risk flags</div>
            {report.flags && report.flags.length > 0 ? (
              report.flags.map((f, i) => (
                <div className="flag" key={i}>
                  {f}
                </div>
              ))
            ) : (
              <div className="no-flags">✓ No specific rug-pull patterns flagged.</div>
            )}

            <div className="meta">
              Audited contract: {address} · chain: {chain}
            </div>
          </div>
        </div>
      )}

      {rawFallback && !report && (
        <div className="result">
          <div className="verdict-body">
            <div className="flags-title">Raw verdict (could not parse JSON)</div>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{rawFallback}</pre>
          </div>
        </div>
      )}

      <footer>
        Verdicts are AI-generated on a decentralized validator network and are not financial advice.
        <br />
        Built on{" "}
        <a href="https://genlayer.com" target="_blank" rel="noreferrer">
          GenLayer
        </a>
        .
      </footer>
    </div>
  );
}
