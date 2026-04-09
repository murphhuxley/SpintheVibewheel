"use client";

import { useRef, useEffect, useCallback } from "react";

const COLORS = [
  "#FFE048", "#FF6B9D", "#8B5CF6", "#2EFF2E",
  "#FF5F1F", "#06B6D4", "#F97316", "#EC4899",
  "#3B82F6", "#14B8A6", "#EF4444", "#A78BFA",
  "#FBBF24", "#F472B6", "#34D399", "#FB923C",
];

const DEFAULT_SPIN_DURATION_MS = 6740;
const WINNER_DIALOG_DELAY_MS = 120;
const MIN_FULL_SPINS = 8;
const MAX_FULL_SPINS = 11;

interface Props {
  entries: string[];
  onSpinEnd: (winner: string, index: number) => void;
  onSpinStart?: () => void;
  disabled?: boolean;
  /** URL of a badge image to display in the center hub */
  centerImageUrl?: string | null;
}

export default function Wheel({ entries, onSpinEnd, onSpinStart, disabled, centerImageUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotation = useRef(0);
  const spinning = useRef(false);
  const spinAudio = useRef<HTMLAudioElement | null>(null);
  const spinDurationMsRef = useRef(DEFAULT_SPIN_DURATION_MS);
  const animationFrameRef = useRef<number | null>(null);
  const winnerTimeoutRef = useRef<number | null>(null);
  const spinStartRotationRef = useRef(0);
  const spinTargetRotationRef = useRef(0);
  const spinStartTimeRef = useRef(0);
  const drawWheelRef = useRef<() => void>(() => {});
  const entriesRef = useRef(entries);
  const spinEntriesRef = useRef(entries);
  const onSpinEndRef = useRef(onSpinEnd);
  const onSpinStartRef = useRef(onSpinStart);

  const centerImageRef = useRef<HTMLImageElement | null>(null);
  const centerImageUrlRef = useRef<string | null>(null);

  entriesRef.current = entries;
  onSpinEndRef.current = onSpinEnd;
  onSpinStartRef.current = onSpinStart;

  // Load center badge image when URL changes
  useEffect(() => {
    if (!centerImageUrl) {
      centerImageRef.current = null;
      centerImageUrlRef.current = null;
      return;
    }
    if (centerImageUrl === centerImageUrlRef.current) return;
    centerImageUrlRef.current = centerImageUrl;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (centerImageUrlRef.current === centerImageUrl) {
        centerImageRef.current = img;
        drawWheelRef.current();
      }
    };
    img.src = centerImageUrl;
  }, [centerImageUrl]);

  // Preload spin sound
  useEffect(() => {
    const audio = new Audio("/wheel-tick.mp3");
    audio.preload = "auto";
    const updateDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        spinDurationMsRef.current = Math.round(audio.duration * 1000);
      }
    };

    audio.addEventListener("loadedmetadata", updateDuration);
    spinAudio.current = audio;
    return () => {
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.pause();
      spinAudio.current = null;
    };
  }, []);

  const playSpinSound = useCallback(() => {
    const audio = spinAudio.current;
    if (!audio) return;

    try {
      audio.currentTime = 0;
      void audio.play().catch(() => {
        /* audio blocked */
      });
    } catch {
      /* audio blocked */
    }
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let resizeObserver: ResizeObserver | null = null;
    let cancelled = false;

    // Resolve the Brice font family from the CSS variable for canvas use.
    // The variable is set on <body> via Next.js localFont className, not on <html>.
    let briceFamily = "serif";
    const resolveFont = () => {
      if (cancelled) return;
      const val = getComputedStyle(document.body).getPropertyValue("--font-brice").trim();
      if (val) {
        briceFamily = val;
      }
      draw();
    };

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
      const items = spinning.current ? spinEntriesRef.current : entriesRef.current;
      const n = items.length;
      const segAngle = n > 0 ? (2 * Math.PI) / n : 2 * Math.PI;

      // Drop shadow beneath wheel for 3D lift
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      ctx.fillStyle = "#121212";
      ctx.fill();
      ctx.restore();

      // Outer bevel ring (3D rim)
      const rimWidth = 8;
      const rimGrad = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
      rimGrad.addColorStop(0, "#FFE048");
      rimGrad.addColorStop(0.3, "#fff8b8");
      rimGrad.addColorStop(0.5, "#FFE048");
      rimGrad.addColorStop(0.7, "#c4a520");
      rimGrad.addColorStop(1, "#8a6f10");
      ctx.beginPath();
      ctx.arc(cx, cy, radius + rimWidth / 2, 0, 2 * Math.PI);
      ctx.strokeStyle = rimGrad;
      ctx.lineWidth = rimWidth;
      ctx.stroke();

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

      // 3D lighting overlay — highlight top-left, shadow bottom-right
      const lightGrad = ctx.createRadialGradient(
        -radius * 0.35, -radius * 0.35, 0,
        0, 0, radius
      );
      lightGrad.addColorStop(0, "rgba(255, 255, 255, 0.12)");
      lightGrad.addColorStop(0.4, "rgba(255, 255, 255, 0.03)");
      lightGrad.addColorStop(0.6, "rgba(0, 0, 0, 0)");
      lightGrad.addColorStop(1, "rgba(0, 0, 0, 0.18)");
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, 2 * Math.PI);
      ctx.fillStyle = lightGrad;
      ctx.fill();

      // Pegs at segment boundaries — metallic 3D pins
      for (let i = 0; i < n; i++) {
        const a = i * segAngle - Math.PI / 2;
        const px = Math.cos(a) * radius;
        const py = Math.sin(a) * radius;
        const pegR = 4;

        // Peg shadow
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 3;
        ctx.shadowOffsetY = 1;
        ctx.beginPath();
        ctx.arc(px, py, pegR, 0, 2 * Math.PI);
        ctx.fillStyle = "#1a1a1a";
        ctx.fill();
        ctx.restore();

        // Metallic gradient
        const pegGrad = ctx.createRadialGradient(px - 1, py - 1, 0, px, py, pegR);
        pegGrad.addColorStop(0, "#FFE048");
        pegGrad.addColorStop(0.6, "#c4a520");
        pegGrad.addColorStop(1, "#6b4f0a");
        ctx.beginPath();
        ctx.arc(px, py, pegR, 0, 2 * Math.PI);
        ctx.fillStyle = pegGrad;
        ctx.fill();
      }

      // Center hub — badge image or 3D dome
      const hasBadgeImg = centerImageRef.current && centerImageRef.current.complete;
      const hubR = hasBadgeImg
        ? Math.max(28, Math.min(48, radius * 0.17))
        : Math.max(22, Math.min(36, radius * 0.13));

      // Hub shadow
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = hasBadgeImg ? 15 : 10;
      ctx.beginPath();
      ctx.arc(0, 0, hubR, 0, 2 * Math.PI);
      ctx.fillStyle = "#0a0a0a";
      ctx.fill();
      ctx.restore();

      if (hasBadgeImg) {
        // Draw badge image clipped to circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, hubR - 2, 0, 2 * Math.PI);
        ctx.clip();
        ctx.drawImage(
          centerImageRef.current!,
          -hubR + 2, -hubR + 2,
          (hubR - 2) * 2, (hubR - 2) * 2
        );
        ctx.restore();

        // Gold ring around badge
        const hubRingGrad = ctx.createLinearGradient(0, -hubR, 0, hubR);
        hubRingGrad.addColorStop(0, "#FFE048");
        hubRingGrad.addColorStop(0.5, "#fff8b8");
        hubRingGrad.addColorStop(1, "#c4a520");
        ctx.beginPath();
        ctx.arc(0, 0, hubR, 0, 2 * Math.PI);
        ctx.strokeStyle = hubRingGrad;
        ctx.lineWidth = 3.5;
        ctx.stroke();
      } else {
        // Default dome hub
        const hubGrad = ctx.createRadialGradient(-hubR * 0.3, -hubR * 0.3, 0, 0, 0, hubR);
        hubGrad.addColorStop(0, "#2a2a2a");
        hubGrad.addColorStop(0.5, "#151515");
        hubGrad.addColorStop(1, "#0a0a0a");
        ctx.beginPath();
        ctx.arc(0, 0, hubR, 0, 2 * Math.PI);
        ctx.fillStyle = hubGrad;
        ctx.fill();

        // Gold ring
        const hubRingGrad = ctx.createLinearGradient(0, -hubR, 0, hubR);
        hubRingGrad.addColorStop(0, "#FFE048");
        hubRingGrad.addColorStop(0.5, "#fff8b8");
        hubRingGrad.addColorStop(1, "#c4a520");
        ctx.strokeStyle = hubRingGrad;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Center dot
        const dotGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, 6);
        dotGrad.addColorStop(0, "#FFE048");
        dotGrad.addColorStop(1, "#c4a520");
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, 2 * Math.PI);
        ctx.fillStyle = dotGrad;
        ctx.fill();
      }

      ctx.restore();
    };

    drawWheelRef.current = draw;
    resolveFont();
    void document.fonts.ready.then(resolveFont);

    resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(canvas);
    window.addEventListener("resize", draw);

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, [getSegmentAt, stopSpinSound]);

  useEffect(() => {
    drawWheelRef.current();
  }, [entries]);

  const finishSpin = useCallback(() => {
    spinning.current = false;
    stopSpinSound();

    const items =
      spinEntriesRef.current.length > 0 ? spinEntriesRef.current : entriesRef.current;
    const winIdx = getSegmentAt(rotation.current, items.length);

    if (winnerTimeoutRef.current !== null) {
      window.clearTimeout(winnerTimeoutRef.current);
    }

    winnerTimeoutRef.current = window.setTimeout(() => {
      onSpinEndRef.current(items[winIdx], winIdx);
      winnerTimeoutRef.current = null;
    }, WINNER_DIALOG_DELAY_MS);
  }, [getSegmentAt, stopSpinSound]);

  const animateSpin = useCallback((timestamp: number) => {
    const progress = Math.min(
      (timestamp - spinStartTimeRef.current) / spinDurationMsRef.current,
      1
    );
    const easedProgress = 1 - Math.pow(1 - progress, 3);

    rotation.current =
      spinStartRotationRef.current +
      (spinTargetRotationRef.current - spinStartRotationRef.current) * easedProgress;

    drawWheelRef.current();

    if (progress < 1) {
      animationFrameRef.current = requestAnimationFrame(animateSpin);
      return;
    }

    animationFrameRef.current = null;
    finishSpin();
  }, [finishSpin]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (winnerTimeoutRef.current !== null) {
        window.clearTimeout(winnerTimeoutRef.current);
      }
      stopSpinSound();
    };
  }, [stopSpinSound]);

  const handleClick = useCallback(() => {
    if (spinning.current || disabled || entriesRef.current.length < 2) return;

    if (winnerTimeoutRef.current !== null) {
      window.clearTimeout(winnerTimeoutRef.current);
      winnerTimeoutRef.current = null;
    }

    const fullSpins =
      MIN_FULL_SPINS + Math.random() * (MAX_FULL_SPINS - MIN_FULL_SPINS);
    const randomOffset = Math.random() * 2 * Math.PI;

    spinEntriesRef.current = [...entriesRef.current];
    spinStartRotationRef.current = rotation.current;
    spinTargetRotationRef.current =
      rotation.current + fullSpins * 2 * Math.PI + randomOffset;
    spinStartTimeRef.current = performance.now();
    spinning.current = true;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    playSpinSound();
    onSpinStartRef.current?.();
    animationFrameRef.current = requestAnimationFrame(animateSpin);
  }, [animateSpin, disabled, playSpinSound]);

  return (
    <div className="relative w-full aspect-square max-w-[640px] mx-auto select-none">
      {/* Pointer — 3D gold arrow */}
      <div
        className="absolute top-0 left-1/2 z-10 pointer-events-none"
        style={{ transform: "translateX(-50%) translateY(-2px)" }}
      >
        {/* Shadow layer */}
        <div
          style={{
            position: "absolute",
            top: 4,
            left: -1,
            width: 0,
            height: 0,
            borderLeft: "16px solid transparent",
            borderRight: "16px solid transparent",
            borderTop: "34px solid rgba(0,0,0,0.4)",
            filter: "blur(3px)",
          }}
        />
        {/* Main pointer */}
        <div
          style={{
            position: "relative",
            width: 0,
            height: 0,
            borderLeft: "15px solid transparent",
            borderRight: "15px solid transparent",
            borderTop: "32px solid #FFE048",
            filter: "drop-shadow(0 2px 4px rgba(255,224,72,0.6))",
          }}
        />
        {/* Highlight stripe */}
        <div
          style={{
            position: "absolute",
            top: 2,
            left: "50%",
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: "16px solid rgba(255,255,255,0.3)",
          }}
        />
      </div>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="w-full h-full cursor-pointer rounded-full"
      />
    </div>
  );
}
