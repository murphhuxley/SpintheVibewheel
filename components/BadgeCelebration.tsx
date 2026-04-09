"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const CONFETTI_COLORS = ["#FFE048", "#FF6B9D", "#8B5CF6", "#2EFF2E", "#FF5F1F", "#06B6D4", "#F97316"];

interface Props {
  badge: { name: string; image: string } | null;
  alignToWheel?: boolean;
  onComplete: () => void;
}

export default function BadgeCelebration({
  badge,
  alignToWheel = false,
  onComplete,
}: Props) {
  const [confetti, setConfetti] = useState<
    Array<{ x: number; delay: number; duration: number; color: string; size: number; drift: number }>
  >([]);

  useEffect(() => {
    if (!badge) return;

    // Celebration sounds handled by Wheel component (chained off spin audio end)
    setConfetti(
      Array.from({ length: 80 }, () => ({
        x: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 1.5 + Math.random() * 2.5,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 6 + Math.random() * 10,
        drift: -30 + Math.random() * 60,
      }))
    );

    const timer = setTimeout(onComplete, 3500);
    return () => clearTimeout(timer);
  }, [badge, onComplete]);

  return (
    <AnimatePresence>
      {badge && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
          onClick={onComplete}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

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

          <motion.div
            initial={{ scale: 0.3, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.1 }}
            className={`relative z-10 text-center ${
              alignToWheel
                ? "lg:-translate-x-[196px] xl:-translate-x-[220px] 2xl:-translate-x-[248px]"
                : ""
            }`}
          >
            <div className="relative mx-auto mb-6 flex h-52 w-52 items-center justify-center sm:h-60 sm:w-60">
              <div
                className="pointer-events-none absolute inset-[14%] rounded-full animate-glowPulse"
                style={{
                  boxShadow:
                    "0 0 55px rgba(255, 224, 72, 0.32), 0 0 110px rgba(255, 224, 72, 0.12)",
                }}
              />
              <div className="absolute inset-2 rounded-[2rem] border border-[#FFE048]/20 bg-[#121212]/88 shadow-[0_0_35px_rgba(255,224,72,0.14)] backdrop-blur-sm" />
              <div className="absolute inset-0 rounded-[2.25rem] border border-[#FFE048]/12" />

              <motion.img
                src={badge.image}
                alt={badge.name}
                initial={{ rotate: -10 }}
                animate={{ rotate: 0 }}
                transition={{ type: "spring", stiffness: 150 }}
                className="relative z-10 h-40 w-40 rounded-[1.6rem] border-2 border-[#FFE048]/40 object-cover sm:h-48 sm:w-48"
                style={{
                  boxShadow:
                    "0 0 36px rgba(255, 224, 72, 0.24), 0 10px 36px rgba(0,0,0,0.45)",
                }}
              />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="max-w-xl px-4"
            >
              <p className="font-body text-white/50 text-sm uppercase tracking-widest mb-1">
                The wheel has chosen
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-black text-shimmer leading-tight">
                {badge.name.toUpperCase()}
              </h2>
              <p className="font-body text-white/30 text-xs mt-3">
                Loading holders onto the wheel...
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
