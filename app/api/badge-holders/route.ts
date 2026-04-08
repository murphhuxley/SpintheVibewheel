import { NextRequest, NextResponse } from "next/server";

import badgeDefinitions from "@/public/badge-definitions.json";
import badgeTokenMap from "@/public/badge_token_map.json";
import {
  getBadgeStrategy,
  truncateAddress,
} from "@/lib/badge-fetch-utils";
import { getBadgeLeaderboard } from "@/lib/gvc-api";
import {
  getErc20BalanceChecks,
  getHoldersForBadge,
  resolveWalletNames,
} from "@/lib/get-badge-holders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Erc20EligibilityInfo = {
  badgeId: string;
  qualificationType: "direct" | "linked";
  balanceDisplay: string;
  minimumRequired: string;
  badgeName: string;
};

type BadgeMatchInfo =
  | {
      badgeId: string;
      badgeName: string;
      qualificationType: "standard";
    }
  | Erc20EligibilityInfo;

type BadgeHolderResponse = {
  addresses: string[];
  entries: string[];
  badgeMatchesByAddress?: Record<string, BadgeMatchInfo[]>;
};

async function loadAddressesForBadge(
  badgeId: string,
  getLeaderboard: () => ReturnType<typeof getBadgeLeaderboard>
): Promise<{
  addresses: string[];
  badgeMatchesByAddress: Record<string, BadgeMatchInfo[]>;
}> {
  const badgeDefinition = badgeDefinitions.find((badge) => badge.id === badgeId);
  const strategy = getBadgeStrategy(
    badgeId,
    badgeTokenMap.badgeToTokens,
    badgeDefinition
  );

  if (strategy === "unsupported") {
    throw new Error(`Badge "${badgeId}" is not supported by the raffle loader`);
  }

  const badgeName = badgeDefinition?.name ?? badgeId;
  const requirementConfig =
    badgeDefinition?.requirement?.config &&
    typeof badgeDefinition.requirement.config === "object"
      ? (badgeDefinition.requirement.config as Record<string, unknown>)
      : null;

  if (
    badgeDefinition?.requirement?.type === "erc20_balance_range" &&
    requirementConfig &&
    typeof requirementConfig.tokenAddress === "string" &&
    typeof requirementConfig.min === "string" &&
    typeof requirementConfig.decimals === "number"
  ) {
    const tokenAddress = requirementConfig.tokenAddress as `0x${string}`;
    const minimumRequired = requirementConfig.min;
    const decimals = requirementConfig.decimals;
    const maximumRequired =
      typeof requirementConfig.max === "string"
        ? requirementConfig.max
        : undefined;
    const leaderboard = await getLeaderboard();
    const leaderboardAddresses = Object.entries(leaderboard.badges)
      .filter(([, badges]) => badges.includes(badgeId))
      .map(([address]) => address.toLowerCase());
    const balanceChecks = await getErc20BalanceChecks(leaderboardAddresses, {
      tokenAddress,
      min: minimumRequired,
      decimals,
      max: maximumRequired,
    });

    return {
      addresses: leaderboardAddresses,
      badgeMatchesByAddress: Object.fromEntries(
        balanceChecks.map((check) => [
          check.address,
          [
            {
              badgeId,
              qualificationType: check.qualifiesDirectly ? "direct" : "linked",
              balanceDisplay: check.balanceDisplay,
              minimumRequired,
              badgeName,
            } satisfies Erc20EligibilityInfo,
          ],
        ])
      ),
    };
  }

  let addresses: string[] = [];

  if (strategy === "leaderboard") {
    const leaderboard = await getLeaderboard();
    addresses = Object.entries(leaderboard.badges)
      .filter(([, badges]) => badges.includes(badgeId))
      .map(([address]) => address.toLowerCase());
  } else {
    addresses = (await getHoldersForBadge(
      badgeId,
      badgeTokenMap.badgeToTokens,
      badgeDefinition
    )).map((address) => address.toLowerCase());
  }

  return {
    addresses,
    badgeMatchesByAddress: Object.fromEntries(
      addresses.map((address) => [
        address,
        [
          {
            badgeId,
            badgeName,
            qualificationType: "standard" as const,
          },
        ],
      ])
    ),
  };
}

export async function POST(request: NextRequest) {
  let requestedBadgeIds: string[] = [];

  try {
    const body = (await request.json()) as {
      badgeId?: unknown;
      badgeIds?: unknown;
    };
    if (typeof body.badgeId === "string") {
      requestedBadgeIds = [body.badgeId];
    } else if (
      Array.isArray(body.badgeIds) &&
      body.badgeIds.every((badgeId): badgeId is string => typeof badgeId === "string")
    ) {
      requestedBadgeIds = Array.from(new Set(body.badgeIds));
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (requestedBadgeIds.length === 0) {
    return NextResponse.json(
      { error: "badgeId or badgeIds is required" },
      { status: 400 }
    );
  }

  try {
    let leaderboardPromise: ReturnType<typeof getBadgeLeaderboard> | null = null;
    const getLeaderboard = () => {
      leaderboardPromise ??= getBadgeLeaderboard();
      return leaderboardPromise;
    };
    const addressSet = new Set<string>();
    const badgeMatchesByAddress: Record<string, BadgeMatchInfo[]> = {};

    for (const badgeId of requestedBadgeIds) {
      const result = await loadAddressesForBadge(badgeId, getLeaderboard);
      for (const address of result.addresses) {
        addressSet.add(address);
        const matches = result.badgeMatchesByAddress[address];
        if (!matches || matches.length === 0) continue;
        if (!badgeMatchesByAddress[address]) {
          badgeMatchesByAddress[address] = [];
        }
        badgeMatchesByAddress[address].push(...matches);
      }
    }

    const addresses = Array.from(addressSet);

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
      badgeMatchesByAddress,
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
