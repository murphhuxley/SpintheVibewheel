"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check } from "lucide-react";

const CONFETTI_COLORS = ["#FFE048", "#FF6B9D", "#8B5CF6", "#2EFF2E", "#FF5F1F", "#06B6D4", "#F97316"];

interface Props {
  winner: string | null;
  /** Full wallet address if available (for copy) */
  fullAddress?: string | null;
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

export default function WinnerDialog({ winner, fullAddress, onClose, onRemove }: Props) {
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const [copied, setCopied] = useState(false);

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
          <motion.div
            initial={{ scale: 0.5, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="relative z-10 bg-[#121212] border border-[#FFE048]/30 rounded-3xl p-8 sm:p-10 max-w-md w-full mx-4 text-center card-glow"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-body text-white/50 text-sm uppercase tracking-widest mb-2">
              We have a winner!
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-black text-shimmer mb-2 break-words leading-tight">
              {winner}
            </h2>
            {fullAddress && fullAddress !== winner && (
              <p className="font-mono text-white/40 text-xs mb-4 break-all">
                {fullAddress}
              </p>
            )}
            {(!fullAddress || fullAddress === winner) && <div className="mb-2" />}

            <button
              onClick={handleCopy}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg mb-6 font-body text-xs transition-all active:scale-95 ${
                copied
                  ? "bg-[#2EFF2E]/10 border border-[#2EFF2E]/30 text-[#2EFF2E]"
                  : "bg-white/[0.04] border border-white/[0.08] text-white/50 hover:border-[#FFE048]/20 hover:text-[#FFE048]"
              }`}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied!" : "Copy Winner"}
            </button>

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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
