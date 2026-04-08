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
import {
  getOwnersForTokens,
  resolveWalletNames,
  truncateAddress,
} from "@/lib/get-badge-holders";

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

interface SavedList {
  name: string;
  entries: string[];
  savedAt: number;
}

interface BadgeDef {
  id: string;
  badgeId: string;
  name: string;
  description: string;
  image: string;
}

interface BadgeTokenMap {
  badgeToTokens: Record<string, string[]>;
  tokenToBadges: Record<string, string[]>;
}

function loadSavedLists(): SavedList[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistLists(lists: SavedList[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
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
  const [badgeDropdownOpen, setBadgeDropdownOpen] = useState(false);
  const [badgeSearch, setBadgeSearch] = useState("");
  const [loadingBadge, setLoadingBadge] = useState(false);
  // Map display name → full wallet address (for badge raffles)
  const [addressMap, setAddressMap] = useState<Map<string, string>>(new Map());

  // Load badge data on mount
  useEffect(() => {
    Promise.all([
      fetch("/badge-definitions.json").then((r) => r.json()),
      fetch("/badge_token_map.json").then((r) => r.json()),
    ]).then(([defs, map]: [BadgeDef[], BadgeTokenMap]) => {
      // Only include badges that have token mappings
      const withTokens = defs.filter(
        (b) => map.badgeToTokens[b.id] && map.badgeToTokens[b.id].length > 0
      );
      setBadges(withTokens);
      setBadgeMap(map);
    });
  }, []);

  // Load saved lists on mount
  useEffect(() => {
    setSavedLists(loadSavedLists());
  }, []);

  const entries = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // Filtered badges for search
  const filteredBadges = useMemo(() => {
    if (!badgeSearch.trim()) return badges;
    const q = badgeSearch.toLowerCase();
    return badges.filter(
      (b) =>
        b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q)
    );
  }, [badges, badgeSearch]);

  const handleSpinStart = useCallback(() => setIsSpinning(true), []);

  const handleSpinEnd = useCallback((name: string, index: number) => {
    setWinner(name);
    setWinnerIdx(index);
    setIsSpinning(false);
  }, []);

  const handleClose = () => setWinner(null);

  const handleRemove = () => {
    const lines = text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    lines.splice(winnerIdx, 1);
    setText(lines.join("\n"));
    setWinner(null);
  };

  const shuffle = () => {
    const lines = text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    for (let i = lines.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lines[i], lines[j]] = [lines[j], lines[i]];
    }
    setText(lines.join("\n"));
  };

  const sort = () => {
    const lines = text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    lines.sort((a, b) => a.localeCompare(b));
    setText(lines.join("\n"));
  };

  const reset = () => {
    setText(DEFAULT_NAMES.join("\n"));
    setActiveListName(null);
    setSelectedBadge(null);
  };

  // Badge selection handler
  const handleBadgeSelect = async (badgeId: string) => {
    if (!badgeMap) return;

    const badge = badges.find((b) => b.id === badgeId);
    const tokenIds = badgeMap.badgeToTokens[badgeId];
    if (!tokenIds || tokenIds.length === 0) {
      toast.error("No tokens found for this badge");
      return;
    }

    setSelectedBadge(badgeId);
    setBadgeDropdownOpen(false);
    setBadgeSearch("");
    setLoadingBadge(true);
    setActiveListName(badge?.name || badgeId);

    try {
      toast.loading(`Fetching ${tokenIds.length} token owners on-chain...`, {
        id: "badge-load",
      });

      // Get unique owners via multicall
      const ownerMap = await getOwnersForTokens(tokenIds);
      const addresses = Array.from(ownerMap.keys());

      // Build display→address map and show truncated addresses immediately
      const newMap = new Map<string, string>();
      addresses.forEach((addr) => newMap.set(truncateAddress(addr), addr));
      setAddressMap(newMap);
      setText(addresses.map(truncateAddress).join("\n"));
      toast.loading(
        `Found ${addresses.length} holders. Resolving names...`,
        { id: "badge-load" }
      );

      // Resolve ENS/Twitter names in background
      const names = await resolveWalletNames(addresses);
      const updatedMap = new Map<string, string>();
      addresses.forEach((addr) => {
        const displayName = names.get(addr) || truncateAddress(addr);
        updatedMap.set(displayName, addr);
      });
      setAddressMap(updatedMap);
      setText(
        addresses
          .map((addr) => names.get(addr) || truncateAddress(addr))
          .join("\n")
      );

      toast.success(
        `Loaded ${addresses.length} holders for "${badge?.name}"`,
        { id: "badge-load" }
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch holders", { id: "badge-load" });
    } finally {
      setLoadingBadge(false);
    }
  };

  // Save list
  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    if (entries.length === 0) {
      toast.error("Add some names first");
      return;
    }

    const updated = loadSavedLists().filter((l) => l.name !== name);
    updated.unshift({ name, entries: [...entries], savedAt: Date.now() });
    persistLists(updated);
    setSavedLists(updated);
    setActiveListName(name);
    setShowSaveInput(false);
    setSaveName("");
    toast.success(`Saved "${name}"`);
  };

  // Load list
  const handleLoad = (list: SavedList) => {
    setText(list.entries.join("\n"));
    setActiveListName(list.name);
    setSelectedBadge(null);
    setShowLoadPanel(false);
    toast.success(`Loaded "${list.name}"`);
  };

  // Delete saved list
  const handleDelete = (name: string) => {
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

  return (
    <main className="min-h-screen relative overflow-hidden">
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

      <div className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-3 mb-6"
        >
          <Image
            src="/shaka.png"
            alt="GVC"
            width={44}
            height={44}
            className="drop-shadow-[0_0_12px_rgba(255,224,72,0.3)]"
          />
          <h1 className="font-display font-black text-4xl sm:text-5xl text-shimmer uppercase">
            SPIN THE VIBEWHEEL
          </h1>
        </motion.header>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-center">
          {/* Wheel panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 80, damping: 20 }}
            className="flex flex-col items-center"
          >
            <Wheel
              entries={entries}
              onSpinEnd={handleSpinEnd}
              onSpinStart={handleSpinStart}
              disabled={isSpinning || loadingBadge}
            />
            <p className="mt-3 text-white/25 font-body text-xs">
              {loadingBadge
                ? "Loading badge holders..."
                : entries.length >= 2
                  ? "Click the wheel to spin"
                  : "Add at least 2 names to spin"}
            </p>
          </motion.div>

          {/* Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-4"
          >
            {/* Badge selector */}
            <div className="bg-[#121212] border border-[#FFE048]/20 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Award size={16} className="text-[#FFE048]" />
                <h3 className="font-display font-bold text-white text-sm uppercase">
                  Badge Raffle
                </h3>
              </div>
              <p className="text-white/30 font-body text-xs mb-3">
                Select a badge to populate the wheel with all holder wallets
              </p>

              {/* Badge dropdown */}
              <div className="relative" ref={badgeDropdownRef}>
                <button
                  onClick={() =>
                    !loadingBadge && setBadgeDropdownOpen(!badgeDropdownOpen)
                  }
                  disabled={loadingBadge || badges.length === 0}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-black/40 border border-white/[0.08] hover:border-[#FFE048]/20 transition-all disabled:opacity-40 text-left"
                >
                  {loadingBadge ? (
                    <Loader2 size={16} className="text-[#FFE048] animate-spin" />
                  ) : selectedBadgeDef ? (
                    <img
                      src={selectedBadgeDef.image}
                      alt=""
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
                      className="absolute z-30 top-full mt-1 left-0 right-0 bg-[#1a1a1a] border border-white/[0.1] rounded-xl overflow-hidden shadow-2xl"
                    >
                      {/* Search */}
                      <div className="p-2 border-b border-white/[0.06]">
                        <input
                          type="text"
                          value={badgeSearch}
                          onChange={(e) => setBadgeSearch(e.target.value)}
                          placeholder="Search badges..."
                          autoFocus
                          className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-white font-body text-xs focus:outline-none focus:border-[#FFE048]/30 placeholder:text-white/20"
                        />
                      </div>
                      {/* Badge list */}
                      <div className="max-h-64 overflow-y-auto">
                        {filteredBadges.length === 0 ? (
                          <p className="text-white/30 font-body text-xs p-4 text-center">
                            No badges found
                          </p>
                        ) : (
                          filteredBadges.map((badge) => {
                            const tokenCount =
                              badgeMap?.badgeToTokens[badge.id]?.length || 0;
                            return (
                              <button
                                key={badge.id}
                                onClick={() => handleBadgeSelect(badge.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors text-left ${
                                  selectedBadge === badge.id
                                    ? "bg-[#FFE048]/5"
                                    : ""
                                }`}
                              >
                                <img
                                  src={badge.image}
                                  alt=""
                                  className="w-7 h-7 rounded flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-white font-body text-xs truncate">
                                    {badge.name}
                                  </p>
                                  <p className="text-white/25 font-body text-[10px]">
                                    {tokenCount} tokens
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
            <div className="bg-[#121212] border border-white/[0.08] rounded-2xl p-5">
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
                <span className="text-white/40 font-body text-sm tabular-nums">
                  {entries.length} {entries.length === 1 ? "name" : "names"}
                </span>
              </div>

              {/* Textarea */}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"Enter names, one per line\u2026"}
                disabled={isSpinning || loadingBadge}
                spellCheck={false}
                className="w-full h-52 bg-black/40 border border-white/[0.08] rounded-xl p-4 text-white font-body text-sm leading-relaxed resize-none focus:outline-none focus:border-[#FFE048]/30 transition-colors placeholder:text-white/20 disabled:opacity-40"
              />

              {/* Action buttons */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={shuffle}
                  disabled={isSpinning || entries.length < 2}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/[0.08] text-white/60 font-body text-xs hover:border-[#FFE048]/20 hover:text-[#FFE048] transition-all disabled:opacity-30 disabled:hover:border-white/[0.08] disabled:hover:text-white/60"
                >
                  <Shuffle size={13} />
                  Shuffle
                </button>
                <button
                  onClick={sort}
                  disabled={isSpinning || entries.length < 2}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/[0.08] text-white/60 font-body text-xs hover:border-[#FFE048]/20 hover:text-[#FFE048] transition-all disabled:opacity-30 disabled:hover:border-white/[0.08] disabled:hover:text-white/60"
                >
                  <ArrowDownAZ size={13} />
                  Sort
                </button>
                <button
                  onClick={reset}
                  disabled={isSpinning}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/[0.08] text-white/60 font-body text-xs hover:border-[#FFE048]/20 hover:text-[#FFE048] transition-all disabled:opacity-30 disabled:hover:border-white/[0.08] disabled:hover:text-white/60"
                >
                  <RotateCcw size={13} />
                  Reset
                </button>
              </div>
            </div>

            {/* Save / Load panel */}
            <div className="bg-[#121212] border border-white/[0.08] rounded-2xl p-5">
              <h3 className="font-display font-bold text-white text-sm uppercase mb-3">
                Saved Lists
              </h3>

              {/* Save & Load buttons */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => {
                    setShowSaveInput(!showSaveInput);
                    setShowLoadPanel(false);
                    setSaveName(activeListName || "");
                  }}
                  disabled={isSpinning || entries.length === 0}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#FFE048]/10 border border-[#FFE048]/20 text-[#FFE048] font-body text-xs hover:bg-[#FFE048]/15 transition-all disabled:opacity-30"
                >
                  <Save size={13} />
                  Save List
                </button>
                <button
                  onClick={() => {
                    setShowLoadPanel(!showLoadPanel);
                    setShowSaveInput(false);
                  }}
                  disabled={isSpinning || savedLists.length === 0}
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
                        onKeyDown={(e) => e.key === "Enter" && handleSave()}
                        placeholder="List name..."
                        autoFocus
                        className="flex-1 bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-white font-body text-sm focus:outline-none focus:border-[#FFE048]/30 placeholder:text-white/20"
                      />
                      <button
                        onClick={handleSave}
                        className="px-4 py-2 rounded-lg bg-[#FFE048] text-[#050505] font-display font-bold text-xs hover:shadow-[0_0_12px_rgba(255,224,72,0.3)] transition-all active:scale-95"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setShowSaveInput(false)}
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
                            activeListName === list.name
                              ? "border-[#FFE048]/30 bg-[#FFE048]/5"
                              : "border-white/[0.06] hover:border-white/[0.12]"
                          }`}
                          onClick={() => handleLoad(list)}
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
        fullAddress={winner ? addressMap.get(winner) || null : null}
        onClose={handleClose}
        onRemove={handleRemove}
      />
    </main>
  );
}
