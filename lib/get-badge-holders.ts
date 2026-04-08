import { createPublicClient, http, getContract } from "viem";
import { mainnet } from "viem/chains";

const GVC_CONTRACT = "0xB8Ea78fcaCEf50d41375E44E6814ebbA36Bb33c4" as const;
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

/**
 * Given a list of token IDs, batch-fetch their owners via multicall.
 * Returns a map of address → count (deduplicated).
 */
export async function getOwnersForTokens(
  tokenIds: string[]
): Promise<Map<string, number>> {
  const owners = new Map<string, number>();

  // Multicall in batches of 200 to avoid RPC limits
  const BATCH = 200;
  for (let i = 0; i < tokenIds.length; i += BATCH) {
    const batch = tokenIds.slice(i, i + BATCH);
    const results = await client.multicall({
      contracts: batch.map((id) => ({
        address: GVC_CONTRACT,
        abi: ownerOfAbi,
        functionName: "ownerOf",
        args: [BigInt(id)],
      })),
    });

    for (const result of results) {
      if (result.status === "success" && result.result) {
        const addr = result.result as string;
        owners.set(addr, (owners.get(addr) || 0) + 1);
      }
    }
  }

  return owners;
}

/**
 * Resolve wallet addresses to display names (ENS or truncated).
 */
export async function resolveWalletNames(
  addresses: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();

  // Fetch in parallel, 10 at a time
  const BATCH = 10;
  for (let i = 0; i < addresses.length; i += BATCH) {
    const batch = addresses.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (addr) => {
        const res = await fetch(`${GVC_API}/wallet/${addr}`);
        if (!res.ok) return { addr, name: null };
        const data = await res.json();
        return {
          addr,
          name: data.ens || data.twitterHandle || null,
        };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        const { addr, name } = result.value;
        names.set(
          addr,
          name || `${addr.slice(0, 6)}...${addr.slice(-4)}`
        );
      }
    }
  }

  // Fill in any missing with truncated address
  for (const addr of addresses) {
    if (!names.has(addr)) {
      names.set(addr, `${addr.slice(0, 6)}...${addr.slice(-4)}`);
    }
  }

  return names;
}

/** Truncate an address for display */
export function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
