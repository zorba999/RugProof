import { NextResponse } from "next/server";
import { getClient, getAccount, getContractAddress } from "@/lib/genlayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export async function POST(req: Request) {
  try {
    const { address, githubUrl, chain } = await req.json();

    if (!address || !githubUrl || !chain) {
      return NextResponse.json({ error: "address, githubUrl and chain are required" }, { status: 400 });
    }
    if (!ADDR_RE.test(String(address).trim())) {
      return NextResponse.json({ error: "address must be a 0x… 40-hex contract address" }, { status: 400 });
    }

    const client = getClient();
    const account = getAccount();

    // Submitting can transiently revert when gas estimation fails on a flaky
    // network (the SDK then falls back to too-little gas). Retry a few times.
    let txId: string | undefined;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        txId = (await client.writeContract({
          account,
          address: getContractAddress(),
          functionName: "analyze",
          args: [String(address).trim(), String(githubUrl).trim(), String(chain).trim()],
          value: 0n,
        })) as string;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (!txId) throw lastErr ?? new Error("Failed to submit analysis");

    return NextResponse.json({ txId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
