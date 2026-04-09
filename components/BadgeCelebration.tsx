"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const CONFETTI_COLORS = ["#FFE048", "#FF6B9D", "#8B5CF6", "#2EFF2E", "#FF5F1F", "#06B6D4", "#F97316"];

interface Props {
  badge: { name: string; image: string } | null;
  onComplete: () => void;
}

export default function BadgeCelebration({ badge, onComplete }: Props) {
  const [confetti, setConfetti] = useState<
    Array<{ x: number; delay: number; duration: number; color: string; size: number; drift: number }>
  >([]);
  const cheerRef = useRef<HTMLAudioElement | null>(null);
  const yayRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    cheerRef.current = new Audio("/cheer.mp3");
    cheerRef.current.preload = "auto";
    yayRef.current = new Audio("/yay.mp3");
    yayRef.current.preload = "auto";
  }, []);

  useEffect(() => {
    if (!badge) return;

    try {
      if (cheerRef.current) { cheerRef.current.currentTime = 0; cheerRef.current.play().catch(() => {}); }
      if (yayRef.current) { yayRef.current.currentTime = 0; yayRef.current.play().catch(() => {}); }
    } catch {}

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
            className="relative z-10 text-center"
          >
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="rounded-full animate-glowPulse"
                style={{
                  width: 220,
                  height: 220,
                  boxShadow: "0 0 60px rgba(255, 224, 72, 0.4), 0 0 120px rgba(255, 224, 72, 0.15)",
                }}
              />
            </div>

            <motion.img
              src={badge.image}
              alt={badge.name}
              initial={{ rotate: -10 }}
              animate={{ rotate: 0 }}
              transition={{ type: "spring", stiffness: 150 }}
              className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl mx-auto relative z-10 border-2 border-[#FFE048]/40"
              style={{
                boxShadow: "0 0 40px rgba(255, 224, 72, 0.3), 0 8px 32px rgba(0,0,0,0.5)",
              }}
            />

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-6"
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
