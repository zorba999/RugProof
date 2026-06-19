import { NextResponse } from "next/server";
import { getClient, getContractAddress } from "@/lib/genlayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });

  try {
    const client = getClient();
    const raw = (await client.readContract({
      address: getContractAddress(),
      functionName: "get_report",
      args: [address.trim()],
    })) as string;

    if (!raw || raw.trim() === "") {
      return NextResponse.json({ ready: false, report: null });
    }

    let report: unknown = null;
    try {
      report = JSON.parse(raw);
    } catch {
      // The model may wrap JSON in prose or fences — pull out the first {...} block.
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          report = JSON.parse(m[0]);
        } catch {
          report = null;
        }
      }
    }

    return NextResponse.json({ ready: true, report, raw });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
