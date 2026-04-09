"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shuffle,
  ArrowDownAZ,
  RotateCcw,
  Save,
  FolderOpen,
  Trash2,
  X,
  Award,
  Loader2,
  ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import Wheel from "@/components/Wheel";
import WinnerDialog from "@/components/WinnerDialog";
import BadgeCelebration from "@/components/BadgeCelebration";
import {
  getBadgeStrategy,
} from "@/lib/badge-fetch-utils";

const DEFAULT_NAMES = [
  "Alice",
  "Bob",
  "Charlie",
  "Diana",
  "Eve",
  "Frank",
  "Grace",
  "Hank",
];

const STORAGE_KEY = "vibewheel:lists";
const RANDOM_BADGE_EXCLUSIONS = new Set(["any_gvc"]);

interface SavedList {
  name: string;
  entries: string[];
  savedAt: number;
  entryAddresses?: Array<string | null>;
}

interface BadgeDef {
  id: string;
  badgeId: string;
  name: string;
  description: string;
  image: string;
  enabled?: boolean;
  requirement?: {
    type?: string;
  };
}

interface BadgeTokenMap {
  badgeToTokens: Record<string, string[]>;
  tokenToBadges: Record<string, string[]>;
}

interface BadgeHoldersResponse {
  addresses: string[];
  entries: string[];
  badgeMatchesByAddress?: Record<
    string,
    Array<{
      badgeId: string;
      badgeName: string;
      qualificationType: "standard" | "direct" | "linked";
      balanceDisplay?: string;
      minimumRequired?: string;
    }>
  >;
  ensByAddress?: Record<string, string>;
}

interface BadgeMatchInfo {
  badgeId: string;
  badgeName: string;
  qualificationType: "standard" | "direct" | "linked";
  balanceDisplay?: string;
  minimumRequired?: string;
}

function parseEntries(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function alignEntryAddresses(
  entryCount: number,
  entryAddresses?: Array<string | null>
): Array<string | null> {
  return Array.from({ length: entryCount }, (_, index) => {
    const address = entryAddresses?.[index];
    return typeof address === "string" && address ? address : null;
  });
}

function loadSavedLists(): SavedList[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as {
        name?: unknown;
        entries?: unknown;
        savedAt?: unknown;
        entryAddresses?: unknown;
      };

      const name = typeof record.name === "string" ? record.name.trim() : "";
      const entries = Array.isArray(record.entries)
        ? record.entries.filter(
            (entry: unknown): entry is string => typeof entry === "string"
          )
        : [];

      if (!name || entries.length === 0) return [];

      return [
        {
          name,
          entries,
          savedAt:
            typeof record.savedAt === "number" ? record.savedAt : Date.now(),
          entryAddresses: alignEntryAddresses(
            entries.length,
            Array.isArray(record.entryAddresses)
              ? record.entryAddresses.map((address: unknown) =>
                  typeof address === "string" && address ? address : null
                )
              : undefined
          ),
        } satisfies SavedList,
      ];
    });
  } catch {
    return [];
  }
}

function persistLists(lists: SavedList[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

function pickRandomItems<T>(items: T[], count: number): T[] {
  const pool = [...items];

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[randomIndex]] = [pool[randomIndex], pool[index]];
  }

  return pool.slice(0, count);
}

export default function Home() {
  const [text, setText] = useState(DEFAULT_NAMES.join("\n"));
  const [winner, setWinner] = useState<string | null>(null);
  const [winnerIdx, setWinnerIdx] = useState(-1);
  const [isSpinning, setIsSpinning] = useState(false);
  const [savedLists, setSavedLists] = useState<SavedList[]>([]);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [showLoadPanel, setShowLoadPanel] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [activeListName, setActiveListName] = useState<string | null>(null);

  // Badge state
  const [badges, setBadges] = useState<BadgeDef[]>([]);
  const [badgeMap, setBadgeMap] = useState<BadgeTokenMap | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);
  const [activeBadgeIds, setActiveBadgeIds] = useState<string[]>([]);
  const [badgeDrawBadges, setBadgeDrawBadges] = useState<BadgeDef[] | null>(
    null
  );
  const [badgeDropdownOpen, setBadgeDropdownOpen] = useState(false);
  const [badgeSearch, setBadgeSearch] = useState("");
  const [loadingBadge, setLoadingBadge] = useState(false);
  const [celebratingBadge, setCelebratingBadge] = useState<BadgeDef | null>(null);
  const pendingBadgeLoadRef = useRef<{ badge: BadgeDef; restoreBadges: BadgeDef[] } | null>(null);
  const [entryAddresses, setEntryAddresses] = useState<Array<string | null>>(
    () => alignEntryAddresses(DEFAULT_NAMES.length)
  );
  const [ensByAddress, setEnsByAddress] = useState<Record<string, string>>({});
  const [badgeMatchesByAddress, setBadgeMatchesByAddress] = useState<
    Record<string, BadgeMatchInfo[]>
  >({});
  const badgeLoadRequestRef = useRef(0);
  const isSpinningRef = useRef(false);
  const loadingBadgeRef = useRef(false);

  // Load badge data on mount
  useEffect(() => {
    Promise.all([
      fetch("/badge-definitions.json").then((r) => r.json()),
      fetch("/badge_token_map.json").then((r) => r.json()),
    ]).then(([defs, map]: [BadgeDef[], BadgeTokenMap]) => {
      // Show all badges — strategy routing handles different types
      setBadges(defs);
      setBadgeMap(map);
    });
  }, []);

  // Load saved lists on mount
  useEffect(() => {
    setSavedLists(loadSavedLists());
  }, []);

  const entries = parseEntries(text);
  const controlsLocked = isSpinning || loadingBadge;
  const isBadgeDrawMode = (badgeDrawBadges?.length ?? 0) > 0;

  useEffect(() => {
    isSpinningRef.current = isSpinning;
  }, [isSpinning]);

  useEffect(() => {
    loadingBadgeRef.current = loadingBadge;
  }, [loadingBadge]);

  // Filtered badges for search
  const filteredBadges = useMemo(() => {
    if (!badgeSearch.trim()) return badges;
    const q = badgeSearch.toLowerCase();
    return badges.filter(
      (b) =>
        b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q)
    );
  }, [badges, badgeSearch]);
  const supportedBadges = useMemo(() => {
    if (!badgeMap) return [];

    return badges.filter((badge) => {
      if (badge.enabled === false) return false;
      if (RANDOM_BADGE_EXCLUSIONS.has(badge.id)) return false;
      return (
        getBadgeStrategy(badge.id, badgeMap.badgeToTokens, badge) !==
        "unsupported"
      );
    });
  }, [badgeMap, badges]);
  const activeBadgeDefs = useMemo(() => {
    if (activeBadgeIds.length === 0) return [];

    const badgeLookup = new Map(badges.map((badge) => [badge.id, badge]));
    return activeBadgeIds
      .map((badgeId) => badgeLookup.get(badgeId))
      .filter((badge): badge is BadgeDef => Boolean(badge));
  }, [activeBadgeIds, badges]);

  const handleSpinStart = useCallback(() => {
    isSpinningRef.current = true;
    setIsSpinning(true);
    setBadgeDropdownOpen(false);
    setBadgeSearch("");
    setShowLoadPanel(false);
    setShowSaveInput(false);
  }, []);

  const invalidateBadgeLoad = useCallback(() => {
    badgeLoadRequestRef.current += 1;
    loadingBadgeRef.current = false;
    setLoadingBadge(false);
    toast.dismiss("badge-load");
  }, []);

  const resetWinner = useCallback(() => {
    setWinner(null);
    setWinnerIdx(-1);
  }, []);

  const handleClose = resetWinner;

  const setManualText = useCallback(
    (value: string) => {
      if (loadingBadge) {
        invalidateBadgeLoad();
      }

      if (selectedBadge || activeBadgeIds.length > 0 || badgeDrawBadges) {
        setSelectedBadge(null);
        setActiveListName(null);
      }

      resetWinner();
      setBadgeDrawBadges(null);
      setEntryAddresses([]);
      setEnsByAddress({});
      setActiveBadgeIds([]);
      setBadgeMatchesByAddress({});
      setText(value);
    },
    [
      activeBadgeIds.length,
      badgeDrawBadges,
      invalidateBadgeLoad,
      loadingBadge,
      resetWinner,
      selectedBadge,
    ]
  );

  const handleRemove = () => {
    if (winnerIdx < 0 || winnerIdx >= entries.length) {
      resetWinner();
      return;
    }

    const nextEntries = [...entries];
    const nextAddresses = alignEntryAddresses(entries.length, entryAddresses);

    nextEntries.splice(winnerIdx, 1);
    nextAddresses.splice(winnerIdx, 1);

    setText(nextEntries.join("\n"));
    setEntryAddresses(nextAddresses);
    resetWinner();
  };

  const shuffle = () => {
    const pairs = entries.map((entry, index) => ({
      entry,
      address: entryAddresses[index] ?? null,
    }));

    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }

    setText(pairs.map(({ entry }) => entry).join("\n"));
    setEntryAddresses(pairs.map(({ address }) => address));
  };

  const sort = () => {
    const pairs = entries.map((entry, index) => ({
      entry,
      address: entryAddresses[index] ?? null,
    }));

    pairs.sort((a, b) => a.entry.localeCompare(b.entry));

    setText(pairs.map(({ entry }) => entry).join("\n"));
    setEntryAddresses(pairs.map(({ address }) => address));
  };

  const reset = () => {
    invalidateBadgeLoad();
    resetWinner();
    setBadgeDrawBadges(null);
    setText(DEFAULT_NAMES.join("\n"));
    setEntryAddresses(alignEntryAddresses(DEFAULT_NAMES.length));
    setEnsByAddress({});
    setActiveBadgeIds([]);
    setBadgeMatchesByAddress({});
    setActiveListName(null);
    setSelectedBadge(null);
    setBadgeDropdownOpen(false);
    setBadgeSearch("");
  };

  const loadBadgeEntries = useCallback(async (
    badgeIds: string[],
    options: {
      singleBadgeId: string | null;
      loadingLabel: string;
      activeName: string;
      successName: string;
    }
  ): Promise<{ entryCount: number } | null> => {
    if (
      !badgeMap ||
      isSpinningRef.current ||
      loadingBadgeRef.current ||
      badgeIds.length === 0
    ) {
      return null;
    }

    setBadgeDropdownOpen(false);
    setBadgeSearch("");
    setShowLoadPanel(false);
    setShowSaveInput(false);
    loadingBadgeRef.current = true;
    setLoadingBadge(true);
    resetWinner();

    const requestId = badgeLoadRequestRef.current + 1;
    badgeLoadRequestRef.current = requestId;

    try {
      toast.loading(options.loadingLabel, { id: "badge-load" });

      const res = await fetch("/api/badge-holders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          badgeIds.length === 1
            ? { badgeId: badgeIds[0] }
            : { badgeIds }
        ),
      });
      const data = (await res.json()) as BadgeHoldersResponse & {
        error?: unknown;
      };
      if (requestId !== badgeLoadRequestRef.current) return null;

      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to fetch holders"
        );
      }

      if (
        !Array.isArray(data.addresses) ||
        !data.addresses.every((address): address is string => typeof address === "string") ||
        !Array.isArray(data.entries) ||
        !data.entries.every((entry): entry is string => typeof entry === "string")
      ) {
        throw new Error("Invalid badge holder response");
      }

      const addresses = data.addresses;
      const loadedEntries = data.entries;
      const loadedEnsByAddress =
        data.ensByAddress &&
        typeof data.ensByAddress === "object" &&
        !Array.isArray(data.ensByAddress)
          ? Object.fromEntries(
              Object.entries(data.ensByAddress).flatMap(([address, ensName]) =>
                typeof ensName === "string" && ensName
                  ? [[address.toLowerCase(), ensName]]
                  : []
              )
            )
          : {};
      const loadedBadgeMatches =
        data.badgeMatchesByAddress &&
        typeof data.badgeMatchesByAddress === "object" &&
        !Array.isArray(data.badgeMatchesByAddress)
          ? Object.fromEntries(
              Object.entries(data.badgeMatchesByAddress).flatMap(
                ([address, matches]) => {
                  if (
                    !Array.isArray(matches) ||
                    matches.some(
                      (match) =>
                        !match ||
                        typeof match !== "object" ||
                        typeof match.badgeId !== "string" ||
                        typeof match.badgeName !== "string" ||
                        (match.qualificationType !== "standard" &&
                          match.qualificationType !== "direct" &&
                          match.qualificationType !== "linked") ||
                        (match.qualificationType !== "standard" &&
                          typeof match.balanceDisplay !== "string") ||
                        (match.qualificationType !== "standard" &&
                          typeof match.minimumRequired !== "string")
                    )
                  ) {
                    return [];
                  }

                  return [[address.toLowerCase(), matches as BadgeMatchInfo[]]];
                }
              )
            )
          : {};

      if (addresses.length === 0) {
        toast.error("No holders found for this badge", { id: "badge-load" });
        loadingBadgeRef.current = false;
        setLoadingBadge(false);
        return null;
      }

      if (addresses.length !== loadedEntries.length) {
        throw new Error("Badge holder response is misaligned");
      }

      setEntryAddresses(alignEntryAddresses(loadedEntries.length, addresses));
      setEnsByAddress(loadedEnsByAddress);
      setBadgeMatchesByAddress(loadedBadgeMatches);
      setText(loadedEntries.join("\n"));
      setSelectedBadge(options.singleBadgeId);
      setActiveBadgeIds(badgeIds);
      setActiveListName(options.activeName);
      toast.success(
        `Loaded ${addresses.length} holders for ${options.successName}`,
        { id: "badge-load" }
      );
      return { entryCount: addresses.length };
    } catch (err) {
      if (requestId !== badgeLoadRequestRef.current) return null;
      console.error(err);
      const msg = err instanceof Error ? err.message : "Failed to fetch holders";
      toast.error(msg, { id: "badge-load" });
    } finally {
      if (requestId === badgeLoadRequestRef.current) {
        loadingBadgeRef.current = false;
        setLoadingBadge(false);
      }
    }
    return null;
  }, [badgeMap, resetWinner]);

  const handleSpinEnd = useCallback((name: string, index: number) => {
    isSpinningRef.current = false;
    setIsSpinning(false);

    if (badgeDrawBadges && badgeDrawBadges.length > 0) {
      const currentBadgeDrawBadges = badgeDrawBadges;
      const drawnBadge =
        currentBadgeDrawBadges.find((badge) => badge.name === name) ??
        currentBadgeDrawBadges[index] ??
        null;

      if (!drawnBadge) {
        toast.error("Could not resolve the drawn badge");
        return;
      }

      // Show celebration, defer holder loading until celebration completes
      pendingBadgeLoadRef.current = { badge: drawnBadge, restoreBadges: currentBadgeDrawBadges };
      setBadgeDrawBadges(null);
      setCelebratingBadge(drawnBadge);
      return;
    }

    setWinner(name);
    setWinnerIdx(index);
  }, [badgeDrawBadges]);

  // Handle badge celebration completion — now load the holders
  const handleCelebrationComplete = useCallback(() => {
    setCelebratingBadge(null);
    const pending = pendingBadgeLoadRef.current;
    if (!pending) return;
    pendingBadgeLoadRef.current = null;

    const { badge: drawnBadge, restoreBadges } = pending;
    void (async () => {
      const result = await loadBadgeEntries([drawnBadge.id], {
        singleBadgeId: drawnBadge.id,
        loadingLabel: `Loading holders for ${drawnBadge.name}...`,
        activeName: drawnBadge.name,
        successName: `"${drawnBadge.name}"`,
      });

      if (!result) {
        setBadgeDrawBadges(restoreBadges);
      }
    })();
  }, [loadBadgeEntries]);

  // Badge selection handler
  const handleBadgeSelect = async (badgeId: string) => {
    if (!badgeMap || controlsLocked) return;

    const badge = badges.find((b) => b.id === badgeId);
    const strategy = getBadgeStrategy(badgeId, badgeMap.badgeToTokens, badge);

    if (strategy === "unsupported") {
      toast.error("That badge isn't supported yet");
      return;
    }

    setBadgeDrawBadges(null);

    const loadingLabel = strategy === "hkm_any" || strategy === "hkm_all"
      ? "Loading HighKey Moments holders..."
      : strategy === "combo" || strategy === "multi_type"
        ? "Loading combo badge holders..."
        : strategy === "leaderboard"
          ? "Loading leaderboard holders..."
          : "Loading badge holders...";

    await loadBadgeEntries([badgeId], {
      singleBadgeId: badgeId,
      loadingLabel,
      activeName: badge?.name || badgeId,
      successName: `"${badge?.name || badgeId}"`,
    });
  };

  const handleRandomizeBadgeSet = async () => {
    if (controlsLocked || supportedBadges.length < 5) {
      if (supportedBadges.length < 5) {
        toast.error("Need at least 5 supported badges to build a challenge");
      }
      return;
    }

    setBadgeDrawBadges(null);
    const chosenBadges = pickRandomItems(supportedBadges, 5);
    const chosenIds = chosenBadges.map((badge) => badge.id);

    await loadBadgeEntries(chosenIds, {
      singleBadgeId: null,
      loadingLabel: "Building 5-badge challenge...",
      activeName: "Random 5 Badge Challenge",
      successName: "your 5-badge challenge",
    });
  };

  const handleRandomBadgeDraw = () => {
    if (controlsLocked || supportedBadges.length < 2) {
      if (supportedBadges.length < 2) {
        toast.error("Need at least 2 supported badges to spin a badge draw");
      }
      return;
    }

    resetWinner();
    setBadgeDrawBadges(supportedBadges);
    setSelectedBadge(null);
    setActiveBadgeIds([]);
    setBadgeMatchesByAddress({});
    setEnsByAddress({});
    setActiveListName("Random Badge Draw");
    setBadgeDropdownOpen(false);
    setBadgeSearch("");
    setShowLoadPanel(false);
    setShowSaveInput(false);
    setEntryAddresses(alignEntryAddresses(supportedBadges.length));
    setText(supportedBadges.map((badge) => badge.name).join("\n"));
    toast.success(
      `Loaded ${supportedBadges.length} badges onto the wheel. Spin to draw one.`
    );
  };

  // Save list
  const handleSave = () => {
    if (controlsLocked) return;

    const name = saveName.trim();
    if (!name) return;
    if (entries.length === 0) {
      toast.error("Add some names first");
      return;
    }

    const updated = loadSavedLists().filter((l) => l.name !== name);
    updated.unshift({
      name,
      entries: [...entries],
      savedAt: Date.now(),
      entryAddresses: alignEntryAddresses(entries.length, entryAddresses),
    });
    persistLists(updated);
    setSavedLists(updated);
    setActiveListName(name);
    setShowSaveInput(false);
    setSaveName("");
    toast.success(`Saved "${name}"`);
  };

  // Load list
  const handleLoad = (list: SavedList) => {
    if (controlsLocked) return;

    invalidateBadgeLoad();
    resetWinner();
    setBadgeDrawBadges(null);
    setText(list.entries.join("\n"));
    setEntryAddresses(
      alignEntryAddresses(list.entries.length, list.entryAddresses)
    );
    setEnsByAddress({});
    setActiveBadgeIds([]);
    setBadgeMatchesByAddress({});
    setActiveListName(list.name);
    setSelectedBadge(null);
    setShowLoadPanel(false);
    setBadgeDropdownOpen(false);
    setBadgeSearch("");
    toast.success(`Loaded "${list.name}"`);
  };

  // Delete saved list
  const handleDelete = (name: string) => {
    if (controlsLocked) return;

    const updated = loadSavedLists().filter((l) => l.name !== name);
    persistLists(updated);
    setSavedLists(updated);
    if (activeListName === name) setActiveListName(null);
    toast.success(`Deleted "${name}"`);
  };

  const selectedBadgeDef = badges.find((b) => b.id === selectedBadge);
  const badgeDropdownRef = useRef<HTMLDivElement>(null);

  // Close badge dropdown on outside click
  useEffect(() => {
    if (!badgeDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        badgeDropdownRef.current &&
        !badgeDropdownRef.current.contains(e.target as Node)
      ) {
        setBadgeDropdownOpen(false);
        setBadgeSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [badgeDropdownOpen]);

  useEffect(() => {
    return () => {
      badgeLoadRequestRef.current += 1;
      toast.dismiss("badge-load");
    };
  }, []);

  const winnerAddress =
    winnerIdx >= 0 ? entryAddresses[winnerIdx] ?? null : null;
  const winnerEnsName =
    winnerAddress && ensByAddress
      ? ensByAddress[winnerAddress.toLowerCase()] ?? null
      : null;
  const winnerBadgeMatches =
    winnerAddress && badgeMatchesByAddress
      ? badgeMatchesByAddress[winnerAddress.toLowerCase()] ?? []
      : null;
  const stageGridClassName =
    "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,0.94fr)_380px] 2xl:grid-cols-[minmax(0,1.16fr)_440px] gap-8 xl:gap-8 2xl:gap-14";

  return (
    <main className="min-h-screen relative overflow-hidden flex flex-col">
      {/* Ambient embers */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="ember"
            style={{
              left: `${10 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
              animationDelay: `${i * 0.8}s`,
              animationDuration: `${4 + i * 0.5}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-[1400px] xl:max-w-[1440px] 2xl:max-w-[1840px] mx-auto px-4 sm:px-6 xl:px-8 2xl:px-10 py-6 xl:py-8 2xl:py-10 flex-1">
        {/* Header */}
        <motion.header
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          className={`${stageGridClassName} items-center mb-6 xl:mb-8`}
        >
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 min-w-0">
            <Image
              src="/shaka.png"
              alt="GVC"
              width={44}
              height={44}
              className="h-11 w-11 xl:h-12 xl:w-12 2xl:h-14 2xl:w-14 drop-shadow-[0_0_12px_rgba(255,224,72,0.3)]"
            />
            <h1 className="font-display font-black text-3xl sm:text-5xl xl:text-6xl 2xl:text-7xl text-shimmer uppercase text-center">
              WHEEL OF VIBES
            </h1>
          </div>
          <div className="hidden lg:block" aria-hidden />
        </motion.header>

        {/* Main layout */}
        <div className={`${stageGridClassName} items-start`}>
          {/* Wheel panel */}
          <motion.div
            initial={false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 80, damping: 20 }}
            className="flex flex-col items-center xl:pt-2"
          >
            <Wheel
              entries={entries}
              onSpinEnd={handleSpinEnd}
              onSpinStart={handleSpinStart}
              disabled={controlsLocked}
              centerImageUrl={selectedBadgeDef?.image || null}
            />
            <p className={`mt-3 font-body text-xs transition-all ${
              !loadingBadge && entries.length >= 2
                ? "text-white/40 animate-pulse"
                : "text-white/25"
            }`}>
              {loadingBadge
                ? "Loading badge holders..."
                : isBadgeDrawMode
                  ? "Spin the wheel to draw a badge"
                  : entries.length >= 2
                  ? "Click the wheel to spin"
                  : "Add at least 2 names to spin"}
            </p>
          </motion.div>

          {/* Sidebar */}
          <motion.div
            initial={false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="w-full space-y-4 xl:space-y-5 lg:max-w-[360px] xl:max-w-[380px] 2xl:max-w-[440px] lg:justify-self-end"
          >
            {/* Badge selector */}
            <div className="bg-[#121212] border border-[#FFE048]/20 rounded-2xl p-5 xl:p-6 2xl:p-7">
              <div className="flex items-center gap-2 mb-3">
                <Award size={16} className="text-[#FFE048]" />
                <h3 className="font-display font-bold text-white text-sm uppercase">
                  Badge Raffle
                </h3>
              </div>
              <p className="text-white/30 font-body text-xs mb-3">
                Pick one badge, spin for a random badge draw, or randomize a
                5-badge challenge. Any wallet with at least one active badge
                becomes eligible for the raffle.
              </p>
              <div className="mb-3 flex gap-2">
                <button
                  onClick={handleRandomBadgeDraw}
                  disabled={controlsLocked || supportedBadges.length < 2}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-white/70 font-body text-xs hover:border-[#FFE048]/20 hover:text-[#FFE048] transition-all disabled:opacity-30"
                >
                  <Award size={13} />
                  {isBadgeDrawMode ? "Reload Badge Wheel" : "Random Badge Draw"}
                </button>
                <button
                  onClick={handleRandomizeBadgeSet}
                  disabled={controlsLocked || supportedBadges.length < 5}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#FFE048]/10 border border-[#FFE048]/20 px-3 py-2.5 text-[#FFE048] font-body text-xs hover:bg-[#FFE048]/15 transition-all disabled:opacity-30"
                >
                  <Shuffle size={13} />
                  {activeBadgeIds.length > 1 ? "Reroll 5 Badges" : "Randomize 5 Badges"}
                </button>
              </div>
              {isBadgeDrawMode && (
                <div className="mb-3 rounded-2xl border border-[#FFE048]/15 bg-[#FFE048]/5 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#FFE048]/60">
                    Badge Wheel Ready
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-white/65">
                    Spin to draw 1 of {supportedBadges.length} eligible badges.
                    Once it lands, that badge will be selected automatically
                    and its holders will populate the entries.
                  </p>
                </div>
              )}
              {activeBadgeDefs.length > 1 && (
                <div className="mb-3 rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                  <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-white/30">
                    Active Challenge
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {activeBadgeDefs.map((badge) => (
                      <div
                        key={badge.id}
                        className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-2"
                      >
                        <Image
                          src={badge.image}
                          alt=""
                          width={28}
                          height={28}
                          className="h-7 w-7 rounded"
                        />
                        <span className="min-w-0 truncate text-xs text-white/80">
                          {badge.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeBadgeDefs.some(
                (badge) => badge.requirement?.type === "erc20_balance_range"
              ) && (
                <p className="mb-3 rounded-xl border border-[#FFE048]/15 bg-[#FFE048]/5 px-3 py-2 text-[11px] leading-relaxed text-[#FFE048]/80">
                  VIBESTR-tier eligibility follows the GVC leaderboard, which can
                  include linked wallets. Winner details will show whether the
                  drawn address qualifies directly or through a connected wallet.
                </p>
              )}

              {/* Badge dropdown */}
              <div className="relative" ref={badgeDropdownRef}>
                <button
                  onClick={() =>
                    !controlsLocked && setBadgeDropdownOpen(!badgeDropdownOpen)
                  }
                  disabled={controlsLocked || badges.length === 0}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-black/40 border border-white/[0.08] hover:border-[#FFE048]/20 transition-all disabled:opacity-40 text-left"
                >
                  {loadingBadge ? (
                    <Loader2 size={16} className="text-[#FFE048] animate-spin" />
                  ) : selectedBadgeDef ? (
                    <Image
                      src={selectedBadgeDef.image}
                      alt=""
                      width={24}
                      height={24}
                      className="w-6 h-6 rounded"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded bg-white/[0.06]" />
                  )}
                  <span
                    className={`flex-1 font-body text-sm truncate ${
                      selectedBadgeDef ? "text-white" : "text-white/30"
                    }`}
                  >
                    {loadingBadge
                      ? "Loading holders..."
                      : selectedBadgeDef
                        ? selectedBadgeDef.name
                        : "Choose a badge..."}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-white/30 transition-transform ${
                      badgeDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Dropdown panel */}
                <AnimatePresence>
                  {badgeDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute z-30 top-full mt-1 left-0 right-0 bg-[#1a1a1a] border border-white/[0.1] rounded-xl overflow-hidden shadow-2xl max-h-[70vh]"
                    >
                      {/* Search */}
                      <div className="p-2 border-b border-white/[0.06]">
                        <input
                          type="text"
                          value={badgeSearch}
                          onChange={(e) => setBadgeSearch(e.target.value)}
                          placeholder="Search badges..."
                          disabled={controlsLocked}
                          className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-white font-body text-base sm:text-xs focus:outline-none focus:border-[#FFE048]/30 placeholder:text-white/20"
                        />
                      </div>
                      {/* Badge list */}
                      <div className="max-h-[60vh] overflow-y-auto overscroll-contain touch-pan-y">
                        {filteredBadges.length === 0 ? (
                          <p className="text-white/30 font-body text-xs p-4 text-center">
                            No badges found
                          </p>
                        ) : (
                          filteredBadges.map((badge) => {
                            const tokenCount =
                              badgeMap?.badgeToTokens[badge.id]?.length || 0;
                            const strategy = badgeMap
                              ? getBadgeStrategy(
                                  badge.id,
                                  badgeMap.badgeToTokens,
                                  badge
                                )
                              : "token_map";
                            const strategyLabel =
                              strategy === "hkm_any" || strategy === "hkm_all"
                                ? "ERC-1155"
                                : strategy === "combo" || strategy === "multi_type"
                                  ? "Combo"
                                  : badge.requirement?.type === "badge_count"
                                    ? "Milestone"
                                    : badge.requirement?.type === "manual_assignment"
                                      ? "Earned"
                                      : badge.requirement?.type?.startsWith("erc20")
                                        ? "VIBESTR"
                                        : strategy === "leaderboard"
                                          ? "Leaderboard"
                                          : strategy === "unsupported"
                                            ? "Unavailable"
                                            : `${tokenCount} tokens`;
                            const isUnavailable = strategy === "unsupported";
                            return (
                              <button
                                key={badge.id}
                                onClick={() => handleBadgeSelect(badge.id)}
                                disabled={controlsLocked || isUnavailable}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors text-left ${
                                  selectedBadge === badge.id
                                    ? "bg-[#FFE048]/5"
                                    : ""
                                } ${isUnavailable ? "opacity-40" : ""} disabled:cursor-not-allowed disabled:hover:bg-transparent`}
                              >
                                <Image
                                  src={badge.image}
                                  alt=""
                                  width={28}
                                  height={28}
                                  className="w-7 h-7 rounded flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-white font-body text-xs truncate">
                                    {badge.name}
                                  </p>
                                  <p className={`font-body text-[10px] ${isUnavailable ? "text-white/15" : "text-white/25"}`}>
                                    {strategyLabel}
                                  </p>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Entries panel */}
            <div className="bg-[#121212] border border-white/[0.08] rounded-2xl p-5 xl:p-6 2xl:p-7">
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-display font-bold text-white text-lg uppercase">
                    Entries
                  </h2>
                  {activeListName && (
                    <p className="text-[#FFE048]/60 font-body text-xs mt-0.5">
                      {activeListName}
                    </p>
                  )}
                </div>
                <span className="text-white/40 font-body text-sm xl:text-base tabular-nums">
                  {entries.length}{" "}
                  {isBadgeDrawMode
                    ? entries.length === 1
                      ? "badge"
                      : "badges"
                    : entries.length === 1
                      ? "name"
                      : "names"}
                </span>
              </div>

              {/* Textarea */}
              <textarea
                value={text}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={"Enter names, one per line\u2026"}
                disabled={controlsLocked}
                spellCheck={false}
                className="w-full h-52 xl:h-60 2xl:h-64 bg-black/40 border border-white/[0.08] rounded-xl p-4 xl:p-5 text-white font-body text-sm leading-relaxed resize-none focus:outline-none focus:border-[#FFE048]/30 transition-colors placeholder:text-white/20 disabled:opacity-40"
              />

              {/* Action buttons */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={shuffle}
                  disabled={controlsLocked || entries.length < 2}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/[0.08] text-white/60 font-body text-xs hover:border-[#FFE048]/20 hover:text-[#FFE048] transition-all disabled:opacity-30 disabled:hover:border-white/[0.08] disabled:hover:text-white/60"
                >
                  <Shuffle size={13} />
                  Shuffle
                </button>
                <button
                  onClick={sort}
                  disabled={controlsLocked || entries.length < 2}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/[0.08] text-white/60 font-body text-xs hover:border-[#FFE048]/20 hover:text-[#FFE048] transition-all disabled:opacity-30 disabled:hover:border-white/[0.08] disabled:hover:text-white/60"
                >
                  <ArrowDownAZ size={13} />
                  Sort
                </button>
                <button
                  onClick={reset}
                  disabled={controlsLocked}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/[0.08] text-white/60 font-body text-xs hover:border-[#FFE048]/20 hover:text-[#FFE048] transition-all disabled:opacity-30 disabled:hover:border-white/[0.08] disabled:hover:text-white/60"
                >
                  <RotateCcw size={13} />
                  Reset
                </button>
              </div>
            </div>

            {/* Save / Load panel */}
            <div className="bg-[#121212] border border-white/[0.08] rounded-2xl p-5 xl:p-6 2xl:p-7">
              <h3 className="font-display font-bold text-white text-sm uppercase mb-3">
                Saved Lists
              </h3>

              {/* Save & Load buttons */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => {
                    if (controlsLocked) return;
                    setShowSaveInput(!showSaveInput);
                    setShowLoadPanel(false);
                    setSaveName(activeListName || "");
                  }}
                  disabled={controlsLocked || entries.length === 0}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#FFE048]/10 border border-[#FFE048]/20 text-[#FFE048] font-body text-xs hover:bg-[#FFE048]/15 transition-all disabled:opacity-30"
                >
                  <Save size={13} />
                  Save List
                </button>
                <button
                  onClick={() => {
                    if (controlsLocked) return;
                    setShowLoadPanel(!showLoadPanel);
                    setShowSaveInput(false);
                  }}
                  disabled={controlsLocked || savedLists.length === 0}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/[0.08] text-white/60 font-body text-xs hover:border-[#FFE048]/20 hover:text-[#FFE048] transition-all disabled:opacity-30"
                >
                  <FolderOpen size={13} />
                  Load ({savedLists.length})
                </button>
              </div>

              {/* Save input */}
              <AnimatePresence>
                {showSaveInput && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={saveName}
                        onChange={(e) => setSaveName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !controlsLocked) {
                            handleSave();
                          }
                        }}
                        placeholder="List name..."
                        autoFocus
                        disabled={controlsLocked}
                        className="flex-1 bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-white font-body text-sm focus:outline-none focus:border-[#FFE048]/30 placeholder:text-white/20"
                      />
                      <button
                        onClick={handleSave}
                        disabled={controlsLocked}
                        className="px-4 py-2 rounded-lg bg-[#FFE048] text-[#050505] font-display font-bold text-xs hover:shadow-[0_0_12px_rgba(255,224,72,0.3)] transition-all active:scale-95"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => !controlsLocked && setShowSaveInput(false)}
                        disabled={controlsLocked}
                        className="px-2 py-2 rounded-lg border border-white/[0.08] text-white/40 hover:text-white/60 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Load panel */}
              <AnimatePresence>
                {showLoadPanel && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {savedLists.map((list) => (
                        <div
                          key={list.name}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all cursor-pointer group ${
                            controlsLocked
                              ? "pointer-events-none opacity-50"
                              : activeListName === list.name
                                ? "border-[#FFE048]/30 bg-[#FFE048]/5"
                                : "border-white/[0.06] hover:border-white/[0.12]"
                          }`}
                          onClick={() => !controlsLocked && handleLoad(list)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-body text-sm truncate">
                              {list.name}
                            </p>
                            <p className="text-white/30 font-body text-xs">
                              {list.entries.length} names
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(list.name);
                            }}
                            disabled={controlsLocked}
                            className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {savedLists.length === 0 && !showSaveInput && (
                <p className="text-white/20 font-body text-xs">
                  No saved lists yet. Save your current entries to reuse them
                  later.
                </p>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Winner dialog */}
      <WinnerDialog
        winner={winner}
        fullAddress={winnerAddress}
        ensName={winnerEnsName}
        alignToWheel
        badgeMatches={winnerBadgeMatches}
        activeBadgeCount={activeBadgeIds.length}
        onClose={handleClose}
        onRemove={handleRemove}
      />

      <BadgeCelebration
        badge={celebratingBadge}
        onComplete={handleCelebrationComplete}
      />

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center border-t border-white/[0.04]">
        <p className="font-body text-white/20 text-xs">
          Powered by{" "}
          <a
            href="https://www.goodvibesclub.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#FFE048]/40 hover:text-[#FFE048]/70 transition-colors"
          >
            Good Vibes Club
          </a>
        </p>
      </footer>
    </main>
  );
}
