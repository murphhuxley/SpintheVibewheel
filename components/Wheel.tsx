"use client";

import { useRef, useEffect, useCallback } from "react";

const COLORS = [
  "#FFE048", "#FF6B9D", "#8B5CF6", "#2EFF2E",
  "#FF5F1F", "#06B6D4", "#F97316", "#EC4899",
  "#3B82F6", "#14B8A6", "#EF4444", "#A78BFA",
  "#FBBF24", "#F472B6", "#34D399", "#FB923C",
];

interface Props {
  entries: string[];
  onSpinEnd: (winner: string, index: number) => void;
  onSpinStart?: () => void;
  disabled?: boolean;
}

export default function Wheel({ entries, onSpinEnd, onSpinStart, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotation = useRef(0);
  const velocity = useRef(0);
  const spinning = useRef(false);
  const spinAudio = useRef<HTMLAudioElement | null>(null);
  const entriesRef = useRef(entries);
  const onSpinEndRef = useRef(onSpinEnd);
  const onSpinStartRef = useRef(onSpinStart);

  entriesRef.current = entries;
  onSpinEndRef.current = onSpinEnd;
  onSpinStartRef.current = onSpinStart;

  // Preload spin sound
  useEffect(() => {
    const audio = new Audio("/wheel-tick.mp3");
    audio.preload = "auto";
    spinAudio.current = audio;
  }, []);

  const playSpinSound = useCallback(() => {
    try {
      const audio = spinAudio.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play();
      }
    } catch { /* audio blocked */ }
  }, []);

  const stopSpinSound = useCallback(() => {
    try {
      const audio = spinAudio.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    } catch { /* audio blocked */ }
  }, []);

  const getSegmentAt = useCallback((rot: number, count: number) => {
    if (count === 0) return -1;
    const seg = (2 * Math.PI) / count;
    const norm = (((-rot) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return Math.floor(norm / seg) % count;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf: number;

    // Resolve the Brice font family from the CSS variable for canvas use.
    // The variable is set on <body> via Next.js localFont className, not on <html>.
    let briceFamily = "serif";
    const resolveFont = () => {
      const val = getComputedStyle(document.body).getPropertyValue("--font-brice").trim();
      if (val) briceFamily = val;
    };
    resolveFont();
    document.fonts.ready.then(resolveFont);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cw = Math.round(rect.width * dpr);
      const ch = Math.round(rect.height * dpr);

      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(cx, cy) - 10;
      const items = entriesRef.current;
      const n = items.length;
      const segAngle = n > 0 ? (2 * Math.PI) / n : 2 * Math.PI;

      // Outer glow
      ctx.save();
      ctx.shadowColor = "rgba(255, 224, 72, 0.15)";
      ctx.shadowBlur = 40;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      ctx.fillStyle = "#121212";
      ctx.fill();
      ctx.restore();

      if (n === 0) {
        ctx.fillStyle = "#555";
        ctx.font = "15px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Add names to spin!", cx, cy);
        return;
      }

      // Segments
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation.current);

      for (let i = 0; i < n; i++) {
        const a1 = i * segAngle - Math.PI / 2;
        const a2 = a1 + segAngle;
        const color = COLORS[i % COLORS.length];

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, a1, a2);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "rgba(5,5,5,0.35)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Text on segment — size must fit within the slice
        if (n <= 80) {
          ctx.save();
          ctx.rotate(a1 + segAngle / 2);

          // Font size based on arc chord at 70% radius, capped conservatively
          const fs = Math.max(8, Math.min(28, (segAngle * radius) / 5.5));
          ctx.font = `700 ${fs}px ${briceFamily}`;
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";

          const isLight = ["#FFE048", "#2EFF2E", "#FBBF24", "#34D399"].includes(color);
          ctx.fillStyle = isLight ? "#050505" : "#ffffff";

          const maxLen = n > 20 ? 10 : n > 10 ? 14 : 20;
          const label = items[i].toUpperCase();
          const txt = label.length > maxLen ? label.slice(0, maxLen - 1) + "\u2026" : label;
          ctx.fillText(txt, radius - 14, 0);
          ctx.restore();
        }
      }

      // Outer ring
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(255,224,72,0.5)";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Pegs at segment boundaries
      for (let i = 0; i < n; i++) {
        const a = i * segAngle - Math.PI / 2;
        const px = Math.cos(a) * radius;
        const py = Math.sin(a) * radius;
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, 2 * Math.PI);
        ctx.fillStyle = "#050505";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,224,72,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Center hub
      const hubR = Math.max(20, Math.min(32, radius * 0.12));
      ctx.beginPath();
      ctx.arc(0, 0, hubR, 0, 2 * Math.PI);
      ctx.fillStyle = "#121212";
      ctx.fill();
      ctx.strokeStyle = "#FFE048";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.restore();
    };

    const loop = () => {
      if (spinning.current) {
        rotation.current += velocity.current;
        velocity.current *= 0.9875;

        if (velocity.current < 0.002) {
          spinning.current = false;
          velocity.current = 0;
          stopSpinSound();
          const items = entriesRef.current;
          const winIdx = getSegmentAt(rotation.current, items.length);
          setTimeout(() => {
            onSpinEndRef.current(items[winIdx], winIdx);
          }, 350);
        }
      }

      draw();
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getSegmentAt, stopSpinSound]);

  const handleClick = useCallback(() => {
    if (spinning.current || disabled || entriesRef.current.length < 2) return;
    velocity.current = 0.15 + Math.random() * 0.35;
    spinning.current = true;
    playSpinSound();
    onSpinStartRef.current?.();
  }, [disabled, getSegmentAt]);

  return (
    <div className="relative w-full aspect-square max-w-[640px] mx-auto select-none">
      {/* Pointer */}
      <div
        className="absolute top-0 left-1/2 z-10 pointer-events-none"
        style={{
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "14px solid transparent",
          borderRight: "14px solid transparent",
          borderTop: "30px solid #FFE048",
          filter: "drop-shadow(0 4px 8px rgba(255,224,72,0.5))",
        }}
      />
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="w-full h-full cursor-pointer rounded-full"
      />
    </div>
  );
}
