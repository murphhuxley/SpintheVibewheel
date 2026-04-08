import "server-only";

import { createPublicClient, http, parseAbiItem } from "viem";
import { mainnet } from "viem/chains";

import {
  COMBO_BADGES,
  getBadgeStrategy,
  truncateAddress,
} from "@/lib/badge-fetch-utils";

const GVC_CONTRACT = "0xB8Ea78fcaCEf50d41375E44E6814ebbA36Bb33c4" as const;
const HKM_CONTRACT = "0x74fcb6eb2a2d02207b36e804d800687ce78d210c" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const GVC_API = "https://api-hazel-pi-72.vercel.app/api";

const client = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum-rpc.publicnode.com"),
});

const ownerOfAbi = [
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const erc20BalanceOfAbi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

function parseHumanToBaseUnits(amount: string, decimals: number): bigint {
  const [intPart, fracPartRaw] = amount.split(".");
  const fracPart = (fracPartRaw || "").slice(0, decimals);
  const paddedFrac = fracPart.padEnd(decimals, "0");
  const normalized = `${intPart}${paddedFrac}`.replace(/^0+(?=\d)/, "");
  return BigInt(normalized.length ? normalized : "0");
}

function formatBaseUnits(
  amount: bigint,
  decimals: number,
  maxFractionDigits = 4
): string {
  if (amount === 0n) return "0";

  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;

  if (decimals === 0) {
    return `${negative ? "-" : ""}${absolute.toString()}`;
  }

  const raw = absolute.toString().padStart(decimals + 1, "0");
  const integerPart = raw.slice(0, -decimals) || "0";
  const fractionPart = raw
    .slice(-decimals)
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${integerPart}${
    fractionPart ? `.${fractionPart}` : ""
  }`;
}

// ─── ERC-721 ownerOf multicall ──────────────────────────────────────────

export async function getOwnersForTokens(
  tokenIds: string[]
): Promise<Map<string, number>> {
  const owners = new Map<string, number>();
  const BATCH = 200;

  for (let i = 0; i < tokenIds.length; i += BATCH) {
    const batch = tokenIds.slice(i, i + BATCH);
    const results = await client.multicall({
      contracts: batch.map((id) => ({
        address: GVC_CONTRACT,
        abi: ownerOfAbi,
        functionName: "ownerOf" as const,
        args: [BigInt(id)],
      })),
    });

    for (const result of results) {
      if (result.status === "success" && result.result) {
        const addr = (result.result as string).toLowerCase();
        owners.set(addr, (owners.get(addr) || 0) + 1);
      }
    }
  }

  return owners;
}

// ─── ERC-20 balance lookup ──────────────────────────────────────────────

export interface Erc20BalanceCheck {
  address: string;
  balanceRaw: string;
  balanceDisplay: string;
  qualifiesDirectly: boolean;
}

export async function getErc20BalanceChecks(
  addresses: string[],
  config: {
    tokenAddress: `0x${string}`;
    min: string;
    decimals: number;
    max?: string;
  }
): Promise<Erc20BalanceCheck[]> {
  if (addresses.length === 0) return [];

  const checks: Erc20BalanceCheck[] = [];
  const BATCH = 200;
  const minUnits = parseHumanToBaseUnits(config.min, config.decimals);
  const maxUnits = config.max
    ? parseHumanToBaseUnits(config.max, config.decimals)
    : null;

  for (let i = 0; i < addresses.length; i += BATCH) {
    const batch = addresses.slice(i, i + BATCH);
    const results = await client.multicall({
      contracts: batch.map((address) => ({
        address: config.tokenAddress,
        abi: erc20BalanceOfAbi,
        functionName: "balanceOf" as const,
        args: [address as `0x${string}`],
      })),
    });

    for (let index = 0; index < results.length; index += 1) {
      const address = batch[index].toLowerCase();
      const result = results[index];
      const balance =
        result.status === "success" && result.result !== undefined
          ? (result.result as bigint)
          : 0n;
      const withinMin = balance >= minUnits;
      const withinMax = maxUnits === null ? true : balance < maxUnits;

      checks.push({
        address,
        balanceRaw: balance.toString(),
        balanceDisplay: formatBaseUnits(balance, config.decimals),
        qualifiesDirectly: withinMin && withinMax,
      });
    }
  }

  return checks;
}

// ─── ERC-20 holder filtering ────────────────────────────────────────────

export async function filterAddressesByErc20Balance(
  addresses: string[],
  config: {
    tokenAddress: `0x${string}`;
    min: string;
    decimals: number;
    max?: string;
  }
): Promise<string[]> {
  const checks = await getErc20BalanceChecks(addresses, config);
  return checks
    .filter((check) => check.qualifiesDirectly)
    .map((check) => check.address);
}

// ─── ERC-1155 holder scanning (HighKey Moments) ─────────────────────────

const transferSingleEvent = parseAbiItem(
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)"
);
const transferBatchEvent = parseAbiItem(
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)"
);

/**
 * Scan ERC-1155 transfer events and build holder balances.
 * Returns: Map<address, Set<tokenId>> — which token IDs each address holds.
 */
async function getERC1155Holders(): Promise<Map<string, Set<string>>> {
  // Balance tracking: address → tokenId → balance
  const balances = new Map<string, Map<string, bigint>>();

  const addBalance = (addr: string, tokenId: string, amount: bigint) => {
    const a = addr.toLowerCase();
    if (a === ZERO_ADDRESS) return;
    if (!balances.has(a)) balances.set(a, new Map());
    const m = balances.get(a)!;
    m.set(tokenId, (m.get(tokenId) || 0n) + amount);
  };

  const subBalance = (addr: string, tokenId: string, amount: bigint) => {
    const a = addr.toLowerCase();
    if (a === ZERO_ADDRESS) return;
    if (!balances.has(a)) balances.set(a, new Map());
    const m = balances.get(a)!;
    m.set(tokenId, (m.get(tokenId) || 0n) - amount);
  };

  // Scan in block ranges to avoid RPC limits
  const latest = await client.getBlockNumber();
  const RANGE = 50000n;
  // HKM contract deployed ~2023, start from block 17000000
  let fromBlock = 17000000n;

  while (fromBlock <= latest) {
    const toBlock = fromBlock + RANGE > latest ? latest : fromBlock + RANGE;

    try {
      const [singles, batches] = await Promise.all([
        client.getLogs({
          address: HKM_CONTRACT,
          event: transferSingleEvent,
          fromBlock,
          toBlock,
        }),
        client.getLogs({
          address: HKM_CONTRACT,
          event: transferBatchEvent,
          fromBlock,
          toBlock,
        }),
      ]);

      for (const log of singles) {
        const { from, to, id, value } = log.args;
        if (!from || !to || id === undefined || value === undefined) continue;
        const tid = id.toString();
        subBalance(from, tid, value);
        addBalance(to, tid, value);
      }

      for (const log of batches) {
        const { from, to, ids, values } = log.args;
        if (!from || !to || !ids || !values) continue;
        for (let i = 0; i < ids.length; i++) {
          const tid = ids[i].toString();
          subBalance(from, tid, values[i]);
          addBalance(to, tid, values[i]);
        }
      }
    } catch {
      // If range too large, try smaller chunks
      if (RANGE > 10000n) {
        const smallRange = 10000n;
        let fb = fromBlock;
        while (fb <= toBlock) {
          const tb = fb + smallRange > toBlock ? toBlock : fb + smallRange;
          try {
            const [singles, batches] = await Promise.all([
              client.getLogs({ address: HKM_CONTRACT, event: transferSingleEvent, fromBlock: fb, toBlock: tb }),
              client.getLogs({ address: HKM_CONTRACT, event: transferBatchEvent, fromBlock: fb, toBlock: tb }),
            ]);
            for (const log of singles) {
              const { from, to, id, value } = log.args;
              if (!from || !to || id === undefined || value === undefined) continue;
              subBalance(from, id.toString(), value);
              addBalance(to, id.toString(), value);
            }
            for (const log of batches) {
              const { from, to, ids, values } = log.args;
              if (!from || !to || !ids || !values) continue;
              for (let i = 0; i < ids.length; i++) {
                subBalance(from, ids[i].toString(), values[i]);
                addBalance(to, ids[i].toString(), values[i]);
              }
            }
          } catch { /* skip chunk */ }
          fb = tb + 1n;
        }
      }
    }

    fromBlock = toBlock + 1n;
  }

  // Convert to holder set: address → Set of token IDs with positive balance
  const holders = new Map<string, Set<string>>();
  const allTokenIds = new Set<string>();

  for (const [addr, tokenBalances] of balances) {
    const held = new Set<string>();
    for (const [tid, bal] of tokenBalances) {
      allTokenIds.add(tid);
      if (bal > 0n) held.add(tid);
    }
    if (held.size > 0) holders.set(addr, held);
  }

  return holders;
}

// Cache HKM data since it's expensive to scan
let hkmCache: { holders: Map<string, Set<string>>; allTokenIds: Set<string>; ts: number } | null = null;

async function getCachedHKMHolders() {
  // Cache for 5 minutes
  if (hkmCache && Date.now() - hkmCache.ts < 300_000) {
    return hkmCache;
  }

  const holders = await getERC1155Holders();
  const allTokenIds = new Set<string>();
  for (const tokenSet of holders.values()) {
    for (const tid of tokenSet) allTokenIds.add(tid);
  }

  hkmCache = { holders, allTokenIds, ts: Date.now() };
  return hkmCache;
}

/**
 * Get holders for HKM I (own any OE) or HKM II (own all OEs).
 */
export async function getHKMBadgeHolders(
  requireAll: boolean
): Promise<string[]> {
  const { holders, allTokenIds } = await getCachedHKMHolders();
  const totalTokenIds = allTokenIds.size;
  const result: string[] = [];

  for (const [addr, held] of holders) {
    if (requireAll) {
      if (held.size >= totalTokenIds) result.push(addr);
    } else {
      result.push(addr);
    }
  }

  return result;
}

// ─── Combo badge holders ────────────────────────────────────────────────

/**
 * Get holders for combo badges (3+ or 5+ tokens with source badge).
 */
export async function getComboBadgeHolders(
  badgeId: string,
  badgeToTokens: Record<string, string[]>
): Promise<string[]> {
  const combo = COMBO_BADGES[badgeId];
  if (!combo) return [];

  const sourceTokenIds = badgeToTokens[combo.sourceBadge];
  if (!sourceTokenIds || sourceTokenIds.length === 0) return [];

  // Get owners for all source tokens
  const ownerMap = await getOwnersForTokens(sourceTokenIds);

  // Filter to those with minCount or more
  const result: string[] = [];
  for (const [addr, count] of ownerMap) {
    if (count >= combo.minCount) result.push(addr);
  }

  return result;
}

/**
 * Universal badge holder fetcher — routes to the right strategy.
 * Returns array of holder addresses.
 */
export async function getHoldersForBadge(
  badgeId: string,
  badgeToTokens: Record<string, string[]>,
  badgeDefinition?: { id?: string; badgeId?: string; requirement?: { type?: string } } | null
): Promise<string[]> {
  const strategy = getBadgeStrategy(badgeId, badgeToTokens, badgeDefinition);

  switch (strategy) {
    case "token_map": {
      const ownerMap = await getOwnersForTokens(badgeToTokens[badgeId]);
      return Array.from(ownerMap.keys());
    }
    case "hkm_any":
      return getHKMBadgeHolders(false);
    case "hkm_all":
      return getHKMBadgeHolders(true);
    case "combo":
      return getComboBadgeHolders(badgeId, badgeToTokens);
    case "multi_type": {
      // Need wallets that own at least 1 plastic, 1 gradient, AND 1 robot
      const [plasticOwners, gradientOwners, robotOwners] = await Promise.all([
        getOwnersForTokens(badgeToTokens["plastic_lover"] || []),
        getOwnersForTokens(badgeToTokens["gradient_lover"] || []),
        getOwnersForTokens(badgeToTokens["robot_lover"] || []),
      ]);
      const result: string[] = [];
      for (const addr of plasticOwners.keys()) {
        if (gradientOwners.has(addr) && robotOwners.has(addr)) {
          result.push(addr);
        }
      }
      return result;
    }
    case "leaderboard":
      throw new Error(
        `Badge "${badgeId}" should be loaded from the badge leaderboard`
      );
    case "unsupported":
      throw new Error(`Badge "${badgeId}" is not supported`);
  }
}

// ─── Wallet name resolution ─────────────────────────────────────────────

export async function resolveWalletNames(
  addresses: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const BATCH = 10;

  for (let i = 0; i < addresses.length; i += BATCH) {
    const batch = addresses.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (addr) => {
        const res = await fetch(`${GVC_API}/wallet/${addr}`);
        if (!res.ok) return { addr, name: null };
        const data = await res.json();
        const name =
          data.ensName || data.ens || data.twitter || data.twitterHandle || data.tag || null;
        return { addr, name };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        const { addr, name } = result.value;
        names.set(addr, name || truncateAddress(addr));
      }
    }
  }

  for (const addr of addresses) {
    if (!names.has(addr)) {
      names.set(addr, truncateAddress(addr));
    }
  }

  return names;
}
