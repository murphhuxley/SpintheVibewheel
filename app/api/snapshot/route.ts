import { NextResponse } from "next/server";

import { truncateAddress } from "@/lib/badge-fetch-utils";
import { resolveWalletDisplayData } from "@/lib/get-badge-holders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SNAPSHOT_URL = "https://goodvibesclub.io/api/raffle-spin/snapshot";

type SnapshotProfile = {
  entriesConsolidated?: unknown;
};

type SnapshotPayload = {
  success?: unknown;
  snapshot?: {
    periodName?: unknown;
    createdAt?: unknown;
    badgeData?: unknown;
    profileConsolidation?: unknown;
  };
};

export async function GET() {
  try {
    const res = await fetch(SNAPSHOT_URL, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Snapshot upstream failed with ${res.status}`);
    }

    const data = (await res.json()) as SnapshotPayload;
    const snapshot = data.snapshot;

    if (!snapshot || typeof snapshot !== "object") {
      throw new Error("Snapshot payload is missing");
    }

    const profileConsolidation =
      snapshot.profileConsolidation &&
      typeof snapshot.profileConsolidation === "object" &&
      !Array.isArray(snapshot.profileConsolidation)
        ? (snapshot.profileConsolidation as Record<string, SnapshotProfile>)
        : null;

    const flattenedEntries = profileConsolidation
      ? Object.values(profileConsolidation).flatMap((profile) =>
          Array.isArray(profile.entriesConsolidated)
            ? profile.entriesConsolidated.filter(
                (entry): entry is string =>
                  typeof entry === "string" && entry.toLowerCase().startsWith("0x")
              )
            : []
        )
      : [];

    const badgeDataEntries =
      snapshot.badgeData &&
      typeof snapshot.badgeData === "object" &&
      !Array.isArray(snapshot.badgeData)
        ? Object.keys(snapshot.badgeData as Record<string, unknown>).filter((address) =>
            address.toLowerCase().startsWith("0x")
          )
        : [];

    const addresses = Array.from(
      new Set(
        (flattenedEntries.length > 0 ? flattenedEntries : badgeDataEntries).map((address) =>
          address.toLowerCase()
        )
      )
    );

    if (addresses.length === 0) {
      return NextResponse.json(
        {
          addresses: [],
          entries: [],
          periodName:
            typeof snapshot.periodName === "string" ? snapshot.periodName : null,
          createdAt:
            typeof snapshot.createdAt === "string" ? snapshot.createdAt : null,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const walletDisplayData = await resolveWalletDisplayData(addresses);

    return NextResponse.json(
      {
        addresses,
        entries: addresses.map(
          (address) =>
            walletDisplayData.get(address)?.displayName ?? truncateAddress(address)
        ),
        ensByAddress: Object.fromEntries(
          addresses.flatMap((address) => {
            const ensName = walletDisplayData.get(address)?.ensName;
            return ensName ? [[address, ensName]] : [];
          })
        ),
        periodName:
          typeof snapshot.periodName === "string" ? snapshot.periodName : null,
        createdAt:
          typeof snapshot.createdAt === "string" ? snapshot.createdAt : null,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load snapshot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
