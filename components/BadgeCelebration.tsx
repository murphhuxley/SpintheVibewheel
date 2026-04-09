"use client";

import Image from "next/image";
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

          <div
            className={
              alignToWheel
                ? "lg:-translate-x-[196px] xl:-translate-x-[220px] 2xl:-translate-x-[248px]"
                : ""
            }
          >
            <motion.div
              initial={{ scale: 0.3, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.1 }}
              className="relative z-10 mx-4 flex w-full max-w-[calc(100vw-2rem)] flex-col items-center text-center sm:max-w-xl"
            >
              <div className="relative mx-auto mb-6 flex h-56 w-56 items-center justify-center sm:h-64 sm:w-64">
                <div className="pointer-events-none absolute inset-0 rounded-full bg-[#FFE048]/14 blur-3xl" />
                <div className="pointer-events-none absolute inset-4 rounded-full border border-[#FFE048]/18 bg-[radial-gradient(circle_at_center,rgba(255,224,72,0.16),rgba(255,224,72,0.02)_58%,transparent_74%)]" />

                <motion.div
                  initial={{ rotate: -10 }}
                  animate={{ rotate: 0 }}
                  transition={{ type: "spring", stiffness: 150 }}
                  className="relative z-10 flex h-44 w-44 items-center justify-center rounded-[2rem] border border-[#FFE048]/24 bg-[#121212]/90 p-3 shadow-[0_0_40px_rgba(255,224,72,0.16),0_16px_40px_rgba(0,0,0,0.42)] backdrop-blur-sm sm:h-52 sm:w-52 sm:rounded-[2.25rem]"
                >
                  <div className="relative h-full w-full overflow-hidden rounded-[1.4rem] sm:rounded-[1.7rem]">
                    <Image
                      src={badge.image}
                      alt={badge.name}
                      fill
                      sizes="(min-width: 640px) 208px, 176px"
                      className="object-cover"
                    />
                  </div>
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="w-full max-w-xl px-4"
              >
                <p className="mb-1 font-body text-sm uppercase tracking-widest text-white/50">
                  The wheel has chosen
                </p>
                <h2 className="font-display text-3xl font-black leading-tight text-shimmer sm:text-4xl">
                  {badge.name.toUpperCase()}
                </h2>
                <p className="mt-3 font-body text-xs text-white/30">
                  Loading holders onto the wheel...
                </p>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
