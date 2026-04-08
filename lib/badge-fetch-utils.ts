export const COMBO_BADGES: Record<
  string,
  { sourceBadge: string; minCount: number }
> = {
  gradient_hatrick: { sourceBadge: "gradient_lover", minCount: 3 },
  gradient_high_five: { sourceBadge: "gradient_lover", minCount: 5 },
  plastic_hatrick: { sourceBadge: "plastic_lover", minCount: 3 },
  plastic_high_five: { sourceBadge: "plastic_lover", minCount: 5 },
  robot_hatrick: { sourceBadge: "robot_lover", minCount: 3 },
  robot_high_five: { sourceBadge: "robot_lover", minCount: 5 },
};

const COLLECTOR_BADGES = new Set([
  "five_badges",
  "ten_badges",
  "fifteen_badges",
  "twenty_badges",
  "thirty_badges",
  "forty_badges",
  "fifty_badges",
  "unfathomable_vibes",
]);

const VIBESTR_BADGES = new Set([
  "vibestr_cosmic_tier",
  "vibestr_diamond_tier",
  "vibestr_gold_tier",
  "vibestr_silver_tier",
  "vibestr_bronze_tier",
  "vibestr_purple_tier",
  "vibestr_pink_tier",
  "vibestr_blue_tier",
]);

const MULTI_TYPE_BADGE = "multi_type_master";

export interface BadgeStrategyDefinition {
  id?: string;
  badgeId?: string;
  requirement?: {
    type?: string;
  };
}

export type BadgeFetchStrategy =
  | "token_map"
  | "hkm_any"
  | "hkm_all"
  | "combo"
  | "multi_type"
  | "leaderboard"
  | "unsupported";

export function getBadgeStrategy(
  badgeId: string,
  badgeToTokens: Record<string, string[]>,
  badgeDefinition?: BadgeStrategyDefinition | null
): BadgeFetchStrategy {
  if (badgeId === "highkeymoments_1") return "hkm_any";
  if (badgeId === "highkeymoments_2") return "hkm_all";
  if (COMBO_BADGES[badgeId]) return "combo";
  if (badgeId === MULTI_TYPE_BADGE) return "multi_type";
  if (badgeToTokens[badgeId]?.length > 0) return "token_map";
  if (
    badgeDefinition ||
    COLLECTOR_BADGES.has(badgeId) ||
    VIBESTR_BADGES.has(badgeId)
  ) {
    return "leaderboard";
  }
  return "unsupported";
}

export function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
