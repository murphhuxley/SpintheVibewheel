"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, ExternalLink } from "lucide-react";

const CONFETTI_COLORS = ["#FFE048", "#FF6B9D", "#8B5CF6", "#2EFF2E", "#FF5F1F", "#06B6D4", "#F97316"];

interface Props {
  winner: string | null;
  /** Full wallet address if available (for copy) */
  fullAddress?: string | null;
  ensName?: string | null;
  alignToWheel?: boolean;
  badgeMatches?: Array<{
    badgeId: string;
    badgeName: string;
    qualificationType: "standard" | "direct" | "linked";
    balanceDisplay?: string;
    minimumRequired?: string;
  }> | null;
  activeBadgeCount?: number;
  onClose: () => void;
  onRemove: () => void;
}

interface ConfettiPiece {
  x: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
  drift: number;
}

function getWinnerHeadingClassName(winner: string | null) {
  const length = winner?.trim().length ?? 0;

  if (length >= 24) {
    return "text-[1.9rem] sm:text-[2.7rem] leading-[0.92] tracking-tight";
  }

  if (length >= 18) {
    return "text-[2.3rem] sm:text-[3.15rem] leading-[0.94] tracking-tight";
  }

  if (length >= 14) {
    return "text-[2.7rem] sm:text-[3.6rem] leading-[0.96] tracking-tight";
  }

  return "text-3xl sm:text-4xl leading-tight";
}

export default function WinnerDialog({
  winner,
  fullAddress,
  ensName,
  alignToWheel = false,
  badgeMatches,
  activeBadgeCount = 0,
  onClose,
  onRemove,
}: Props) {
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const [copied, setCopied] = useState(false);
  const [resolvedEnsName, setResolvedEnsName] = useState<string | null>(
    ensName ?? null
  );
  const cheerRef = useRef<HTMLAudioElement | null>(null);
  const yayRef = useRef<HTMLAudioElement | null>(null);
  const openSeaUrl =
    fullAddress && fullAddress.startsWith("0x")
      ? `https://opensea.io/${encodeURIComponent(fullAddress)}`
      : null;
  const directOrLinkedMatches = (badgeMatches || []).filter(
    (match) => match.qualificationType !== "standard"
  );
  const winnerHeadingClassName = getWinnerHeadingClassName(winner);

  // Preload celebration sounds
  useEffect(() => {
    cheerRef.current = new Audio("/cheer.mp3");
    cheerRef.current.preload = "auto";
    yayRef.current = new Audio("/yay.mp3");
    yayRef.current.preload = "auto";
  }, []);

  useEffect(() => {
    setResolvedEnsName(ensName ?? null);
  }, [ensName, winner]);

  useEffect(() => {
    if (!winner || !fullAddress || !fullAddress.startsWith("0x") || ensName) {
      return;
    }

    let cancelled = false;

    const lookupEnsName = async () => {
      try {
        const res = await fetch("/api/ens-name", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ address: fullAddress }),
        });

        if (!res.ok) return;

        const data = (await res.json()) as { ensName?: unknown };
        if (
          !cancelled &&
          typeof data.ensName === "string" &&
          data.ensName.length > 0
        ) {
          setResolvedEnsName(data.ensName);
        }
      } catch {
        // Ignore lookup failures and keep existing display.
      }
    };

    void lookupEnsName();

    return () => {
      cancelled = true;
    };
  }, [ensName, fullAddress, winner]);

  const copyValue = fullAddress || winner || "";

  const handleCopy = async () => {
    if (!copyValue) return;
    try {
      await navigator.clipboard.writeText(copyValue);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = copyValue;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (winner) {
      setCopied(false);
      // Play celebration sounds
      try {
        if (cheerRef.current) { cheerRef.current.currentTime = 0; cheerRef.current.play().catch(() => {}); }
        if (yayRef.current) { yayRef.current.currentTime = 0; yayRef.current.play().catch(() => {}); }
      } catch { /* audio blocked */ }
      setConfetti(
        Array.from({ length: 70 }, () => ({
          x: Math.random() * 100,
          delay: Math.random() * 0.6,
          duration: 1.5 + Math.random() * 2.5,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          size: 6 + Math.random() * 10,
          drift: -30 + Math.random() * 60,
        }))
      );
    }
  }, [winner]);

  return (
    <AnimatePresence>
      {winner && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Confetti */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {confetti.map((c, i) => (
              <div
                key={i}
                className="absolute animate-confetti"
                style={{
                  left: `${c.x}%`,
                  top: -20,
                  width: c.size,
                  height: c.size * 0.6,
                  backgroundColor: c.color,
                  animationDelay: `${c.delay}s`,
                  animationDuration: `${c.duration}s`,
                  borderRadius: Math.random() > 0.5 ? "50%" : "2px",
                  ["--drift" as string]: `${c.drift}px`,
                }}
              />
            ))}
          </div>

          {/* Dialog card */}
          <div
            className={
              alignToWheel
                ? "lg:-translate-x-[196px] xl:-translate-x-[220px] 2xl:-translate-x-[248px]"
                : ""
            }
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="relative z-10 bg-[#121212] border border-[#FFE048]/30 rounded-3xl p-8 sm:p-10 max-w-xl w-full mx-4 text-center card-glow"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-body text-white/50 text-sm uppercase tracking-widest mb-2">
                We have a winner!
              </p>
              <h2
                className={`font-display font-black text-shimmer mb-2 ${winnerHeadingClassName}`}
              >
                {winner}
              </h2>
              {fullAddress && fullAddress !== winner && (
                <p className="font-mono text-white/40 text-xs mb-4 break-all">
                  {fullAddress}
                </p>
              )}
              {resolvedEnsName && resolvedEnsName !== winner && (
                <p className="mb-4 text-xs text-[#FFE048]/80 break-all">
                  ENS: {resolvedEnsName}
                </p>
              )}
              {badgeMatches && badgeMatches.length > 0 && (
                <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left">
                  <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-white/35">
                    {activeBadgeCount > 1
                      ? `Qualified Through ${badgeMatches.length} of ${activeBadgeCount} Active Badges`
                      : "Qualifying Badge"}
                  </p>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {badgeMatches.map((match) => (
                      <span
                        key={`${match.badgeId}-${match.qualificationType}`}
                        className="rounded-full border border-[#FFE048]/20 bg-[#FFE048]/8 px-2.5 py-1 text-[11px] text-[#FFE048]"
                      >
                        {match.badgeName}
                      </span>
                    ))}
                  </div>
                  {directOrLinkedMatches.length > 0 && (
                    <div className="space-y-2">
                      {directOrLinkedMatches.map((match) => (
                        <p
                          key={`${match.badgeId}-${match.qualificationType}-detail`}
                          className={`rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${
                            match.qualificationType === "direct"
                              ? "border-[#2EFF2E]/25 bg-[#2EFF2E]/6 text-white/75"
                              : "border-[#FFE048]/20 bg-[#FFE048]/6 text-white/75"
                          }`}
                        >
                          {match.qualificationType === "direct"
                            ? `Direct holder for ${match.badgeName}. Wallet balance: ${match.balanceDisplay} (minimum ${match.minimumRequired}).`
                            : `Linked-wallet eligible for ${match.badgeName}. This wallet's direct balance is ${match.balanceDisplay} (minimum ${match.minimumRequired}).`}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {(!fullAddress || fullAddress === winner) &&
                (!badgeMatches || badgeMatches.length === 0) && (
                <div className="mb-2" />
              )}

              <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
                <button
                  onClick={handleCopy}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-body text-xs transition-all active:scale-95 ${
                    copied
                      ? "bg-[#2EFF2E]/10 border border-[#2EFF2E]/30 text-[#2EFF2E]"
                      : "bg-white/[0.04] border border-white/[0.08] text-white/50 hover:border-[#FFE048]/20 hover:text-[#FFE048]"
                  }`}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Copied!" : "Copy Winner"}
                </button>
                {openSeaUrl && (
                  <a
                    href={openSeaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 hover:border-[#FFE048]/20 hover:text-[#FFE048] font-body text-xs transition-all active:scale-95"
                  >
                    <ExternalLink size={13} />
                    View on OpenSea
                  </a>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={onRemove}
                  className="flex-1 px-5 py-3.5 rounded-xl bg-[#FFE048] text-[#050505] font-display font-bold text-sm hover:shadow-[0_0_20px_rgba(255,224,72,0.3)] transition-all active:scale-95"
                >
                  REMOVE & SPIN AGAIN
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-5 py-3.5 rounded-xl border border-white/10 text-white/60 font-body text-sm hover:border-white/20 hover:text-white/80 transition-all active:scale-95"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
