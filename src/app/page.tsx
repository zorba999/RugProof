"use client";

import { useState, useRef } from "react";

type Report = {
  verdict?: "SAFE" | "RISKY" | "SCAM";
  score?: number;
  source_match?: "MATCH" | "MISMATCH" | "UNVERIFIED";
  flags?: string[];
  summary?: string;
};

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

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setReport(null);
    setRawFallback("");
    setBusy(true);
    cancelled.current = false;

    try {
      setStage("Submitting analysis transaction to GenLayer…");
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, githubUrl, chain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit analysis");

      const txId: string = data.txId;
      setStage("Validators are auditing the contract (this takes 30–90s)…");

      // Poll the consensus status for nicer feedback.
      const started = Date.now();
      const TIMEOUT = 5 * 60 * 1000;
      while (!cancelled.current && Date.now() - started < TIMEOUT) {
        await sleep(5000);

        const st = await fetch(`/api/status?txId=${txId}`).then((r) => r.json());
        if (st.failed) throw new Error(`Consensus did not resolve (status: ${st.status}). Try again.`);
        if (st.status && !st.done) setStage(`Validators auditing… (${st.status.toLowerCase()})`);

        // Once accepted/finalized, the report is readable.
        const rep = await fetch(`/api/report?address=${encodeURIComponent(address)}`).then((r) => r.json());
        if (rep.ready) {
          if (rep.report) {
            setReport(rep.report as Report);
          } else {
            setRawFallback(rep.raw || "");
          }
          setStage("");
          setBusy(false);
          return;
        }
      }
      throw new Error("Timed out waiting for the verdict. The transaction may still finalize — try reading the report again shortly.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStage("");
      setBusy(false);
    }
  }

  const verdict = report?.verdict ?? "RISKY";
  const score = typeof report?.score === "number" ? report!.score : null;

  return (
    <div className="wrap">
      <div className="brand">
        <div className="logo">🛡️</div>
        <h1>RugProof</h1>
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
            <button className="scan" type="submit" disabled={busy || !address || !githubUrl}>
              {busy ? "Scanning…" : "Scan contract"}
            </button>
          </div>
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
