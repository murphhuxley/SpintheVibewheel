import { NextRequest, NextResponse } from "next/server";

import { resolveEnsNameOnChain } from "@/lib/get-badge-holders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { address?: unknown };
    const address =
      typeof body.address === "string" ? body.address.trim().toLowerCase() : "";

    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: "Valid wallet address is required" },
        { status: 400 }
      );
    }

    const ensName = await resolveEnsNameOnChain(address as `0x${string}`);

    return NextResponse.json(
      { ensName },
      {
        headers: {
          "Cache-Control": "s-maxage=300, stale-while-revalidate=3600",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to resolve ENS name" },
      { status: 500 }
    );
  }
}
