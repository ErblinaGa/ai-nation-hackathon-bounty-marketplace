"use client";

import { useEffect, useState } from "react";

interface CountdownProps {
  deadlineAt: string;
  className?: string;
}

function computeRemaining(deadlineAt: string): { minutes: number; seconds: number; expired: boolean } {
  const diff = Math.floor((new Date(deadlineAt).getTime() - Date.now()) / 1000);
  if (diff <= 0) return { minutes: 0, seconds: 0, expired: true };
  return {
    minutes: Math.floor(diff / 60),
    seconds: diff % 60,
    expired: false,
  };
}

export default function Countdown({ deadlineAt, className = "" }: CountdownProps) {
  const [state, setState] = useState(() => computeRemaining(deadlineAt));

  useEffect(() => {
    setState(computeRemaining(deadlineAt));
    const id = setInterval(() => {
      setState(computeRemaining(deadlineAt));
    }, 1000);
    return () => clearInterval(id);
  }, [deadlineAt]);

  if (state.expired) {
    return (
      <span className={`font-mono text-danger font-semibold ${className}`} aria-label="Bounty expired">
        EXPIRED
      </span>
    );
  }

  const totalSeconds = state.minutes * 60 + state.seconds;
  const isUrgent = totalSeconds < 30;

  return (
    <span
      className={`font-mono font-semibold tabular-nums ${isUrgent ? "text-danger" : "text-fg"} ${className}`}
      aria-label={`${state.minutes} minutes and ${state.seconds} seconds remaining`}
    >
      {state.minutes}m {String(state.seconds).padStart(2, "0")}s
    </span>
  );
}
