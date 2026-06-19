import { NextResponse } from "next/server";
import { getClient } from "@/lib/genlayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GenLayer consensus status codes, in enum order, for when status comes back numeric.
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

export async function GET(req: Request) {
  const txId = new URL(req.url).searchParams.get("txId");
  if (!txId) return NextResponse.json({ error: "txId required" }, { status: 400 });

  try {
    const client = getClient();
    const tx = await client.getTransaction({ hash: txId as never });
    const status: string = normalizeStatus(tx?.status);
    return NextResponse.json({
      status,
      done: DONE.has(status),
      failed: FAILED.has(status),
    });
  } catch {
    // Not indexed yet — treat as still pending.
    return NextResponse.json({ status: "PENDING", done: false, failed: false });
  }
}
