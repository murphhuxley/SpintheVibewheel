import { NextRequest, NextResponse } from "next/server";

import badgeTokenMap from "@/public/badge_token_map.json";
import {
  getBadgeStrategy,
  truncateAddress,
} from "@/lib/badge-fetch-utils";
import {
  getHoldersForBadge,
  resolveWalletNames,
} from "@/lib/get-badge-holders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type BadgeHolderResponse = {
  addresses: string[];
  entries: string[];
};

export async function POST(request: NextRequest) {
  let badgeId: string | null = null;

  try {
    const body = (await request.json()) as { badgeId?: unknown };
    badgeId = typeof body.badgeId === "string" ? body.badgeId : null;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!badgeId) {
    return NextResponse.json(
      { error: "badgeId is required" },
      { status: 400 }
    );
  }

  const strategy = getBadgeStrategy(badgeId, badgeTokenMap.badgeToTokens);

  if (strategy === "collector" || strategy === "vibestr") {
    return NextResponse.json(
      {
        error:
          strategy === "collector"
            ? "Collector milestone badges require per-wallet evaluation and can't be fetched globally"
            : "VIBESTR tier badges require on-chain ERC-20 balance scanning (coming soon)",
      },
      { status: 400 }
    );
  }

  try {
    const addresses = await getHoldersForBadge(
      badgeId,
      badgeTokenMap.badgeToTokens
    );

    if (addresses.length === 0) {
      const emptyResponse: BadgeHolderResponse = {
        addresses: [],
        entries: [],
      };
      return NextResponse.json(emptyResponse, {
        headers: {
          "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
        },
      });
    }

    const names = await resolveWalletNames(addresses);
    const response: BadgeHolderResponse = {
      addresses,
      entries: addresses.map(
        (address) => names.get(address) ?? truncateAddress(address)
      ),
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load badge holders";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
