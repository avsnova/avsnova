import { useEffect, useRef, useState } from "react";

interface AnimatedBalanceProps {
  value: number;          // amount in NGN
  hidden?: boolean;       // mask the value
  className?: string;
  prefix?: string;
}

// Smoothly counts the displayed balance up/down whenever `value` changes (fintech feel).
export default function AnimatedBalance({ value, hidden = false, className = "", prefix = "₦" }: AnimatedBalanceProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) { setDisplay(to); return; }
    const duration = 700;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) { rafRef.current = requestAnimationFrame(tick); }
      else { fromRef.current = to; setDisplay(to); }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);

  const formatted = display.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <span className={className} aria-live="polite">
      {hidden ? (
        <span className="tracking-widest">{prefix}••••••</span>
      ) : (
        <span>{prefix}{formatted}</span>
      )}
    </span>
  );
}
