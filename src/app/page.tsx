"use client";

import { useState, useRef, useEffect } from "react";
import gsap from "gsap";
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
const GAUGE_R = 52;
const GAUGE_C = 2 * Math.PI * GAUGE_R;

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

  // Wallet
  const [walletAddr, setWalletAddr] = useState("");
  const [connecting, setConnecting] = useState(false);
  const sessionRef = useRef<WalletSession | null>(null);

  // Animation refs
  const rootRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const gaugeRef = useRef<SVGCircleElement>(null);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Entrance + ambient animations
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".reveal", { y: 28, opacity: 0, duration: 0.8, stagger: 0.1 })
        .from(".card", { y: 30, opacity: 0, duration: 0.8 }, "-=0.5");

      gsap.to(".orb", {
        y: "+=24",
        x: "+=14",
        duration: 5,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
        stagger: 0.7,
      });

      // Radar pings
      gsap.set(".ping", { scale: 0.5, opacity: 0.6, transformOrigin: "center" });
      gsap.to(".ping", {
        scale: 1,
        opacity: 0,
        duration: 2.6,
        repeat: -1,
        ease: "power1.out",
        stagger: 1.3,
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  // Mouse parallax on hero
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = (e.clientX - cx) / cx;
      const dy = (e.clientY - cy) / cy;
      gsap.to(".radar", { x: dx * 14, y: dy * 10, duration: 0.8, ease: "power2.out" });
      gsap.to(".orb.a", { x: dx * 30, y: dy * 30, duration: 1.2 });
      gsap.to(".orb.b", { x: dx * -36, y: dy * -24, duration: 1.2 });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Wallet account changes
  useEffect(() => {
    const eth = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!eth?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const accounts = (args[0] as string[]) || [];
      if (accounts.length === 0) {
        sessionRef.current = null;
        setWalletAddr("");
      } else setWalletAddr(accounts[0]);
    };
    eth.on("accountsChanged", onAccounts);
    return () => eth.removeListener?.("accountsChanged", onAccounts);
  }, []);

  // Verdict reveal: count-up + gauge sweep
  useEffect(() => {
    if (!report) return;
    const score = typeof report.score === "number" ? report.score : 0;
    const verdict = report.verdict ?? "RISKY";
    const color = `var(--${verdict.toLowerCase()})`;

    const ctx = gsap.context(() => {
      gsap.from(".result", { y: 26, opacity: 0, scale: 0.97, duration: 0.7, ease: "back.out(1.5)" });
      gsap.from(".flag-item", { x: -18, opacity: 0, stagger: 0.07, delay: 0.25, ease: "power2.out" });

      const counter = { v: 0 };
      gsap.to(counter, {
        v: score,
        duration: 1.3,
        ease: "power2.out",
        onUpdate: () => {
          if (scoreRef.current) scoreRef.current.textContent = String(Math.round(counter.v));
        },
      });

      if (gaugeRef.current) {
        gsap.set(gaugeRef.current, { stroke: color, strokeDasharray: GAUGE_C, strokeDashoffset: GAUGE_C });
        gsap.to(gaugeRef.current, {
          strokeDashoffset: GAUGE_C * (1 - score / 100),
          duration: 1.3,
          ease: "power2.out",
        });
      }
    }, rootRef);
    return () => ctx.revert();
  }, [report]);

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

      const before = await getReport(address).catch(() => ({ raw: "" }));
      const beforeRaw = before.raw || "";

      setStage("Confirm the transaction in your wallet…");
      const txId = await analyzeViaWallet(sessionRef.current, { address, githubUrl, chain });

      setStage("Validators are auditing the contract (this takes 30–90s)…");

      const started = Date.now();
      const TIMEOUT = 6 * 60 * 1000;
      while (!cancelled.current && Date.now() - started < TIMEOUT) {
        await sleep(4000);

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
      throw new Error("Timed out waiting for the verdict. The transaction may still finalize — try again shortly.");
    } catch (err) {
      setError(walletErrorMessage(err));
      setStage("");
      setBusy(false);
    }
  }

  const verdict = report?.verdict ?? "RISKY";

  return (
    <>
      <div className="bg" aria-hidden>
        <div className="bg-grid" />
        <div className="orb a" />
        <div className="orb b" />
        <div className="orb c" />
      </div>

      <div className="wrap" ref={rootRef}>
        <div className="topbar reveal">
          <div className="brand">
            <span className="mark">🛡️</span>
            <span>RugProof</span>
          </div>
          {walletAddr ? (
            <div className="wallet-pill" title={walletAddr}>
              <span className="dot" />
              {shortAddr(walletAddr)}
            </div>
          ) : (
            <button className="connect" type="button" onClick={onConnect} disabled={connecting || !hasWallet()}>
              {connecting ? "Connecting…" : hasWallet() ? "Connect Wallet" : "No wallet found"}
            </button>
          )}
        </div>

        <div className="hero">
          <div className={`radar reveal ${busy ? "scanning" : ""}`}>
            <span className="ring" />
            <span className="ring r2" />
            <span className="ring r3" />
            <span className="cross" />
            <span className="sweep" />
            <span className="ping" />
            <span className="ping" />
            <span className="core">🛡️</span>
          </div>

          <h1 className="title reveal">RugProof</h1>
          <p className="tagline reveal">
            Does the deployed contract really match its GitHub source — and is it free of
            rug-pull backdoors? An AI auditor reads both and reaches consensus on a verdict.
          </p>
          <p className="powered reveal">
            Powered by <b>GenLayer</b> intelligent contracts · Bradbury testnet
          </p>
        </div>

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
            <button className="scan" type="submit" disabled={busy || !address || !githubUrl || !walletAddr}>
              {busy ? "Scanning…" : walletAddr ? "Scan contract" : "Connect wallet to scan"}
            </button>
          </div>

          <div className="hint">
            {walletAddr
              ? "Your connected wallet signs & pays for this scan (needs Bradbury GEN for gas)."
              : "Connect your EVM wallet — it will sign and pay for the scan transaction."}
          </div>
        </form>

        {stage && (
          <div className="status">
            <span className="scanline" />
            <span>{stage}</span>
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {report && (
          <div className="result">
            <div className={`verdict-top ${verdict}`}>
              <div className="gauge">
                <svg width="124" height="124" viewBox="0 0 124 124">
                  <circle cx="62" cy="62" r={GAUGE_R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="9" />
                  <circle
                    ref={gaugeRef}
                    cx="62"
                    cy="62"
                    r={GAUGE_R}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={GAUGE_C}
                    strokeDashoffset={GAUGE_C}
                  />
                </svg>
                <div className="score-num" style={{ color: `var(--${verdict.toLowerCase()})` }}>
                  <span>
                    <span ref={scoreRef}>0</span>
                    <small>/ 100 safe</small>
                  </span>
                </div>
              </div>

              <div className="verdict-meta">
                <div className={`verdict-label ${verdict}`}>
                  {verdict === "SAFE" ? "✓" : verdict === "SCAM" ? "✕" : "!"} {verdict}
                </div>
                {report.source_match && <span className={`badge ${report.source_match}`}>Source: {report.source_match}</span>}
              </div>
            </div>

            <div className="verdict-body">
              {report.summary && <p className="summary">{report.summary}</p>}
              <div className="flags-title">Risk flags</div>
              {report.flags && report.flags.length > 0 ? (
                report.flags.map((f, i) => (
                  <div className="flag-item" key={i}>
                    <span className="ico">⚠</span>
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
    </>
  );
}
