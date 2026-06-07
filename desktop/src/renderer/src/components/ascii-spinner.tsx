import { useEffect, useState } from "react";

import { cn } from "../lib/utils";

const frames = [".     ", "..    ", "...   ", "....  ", "..... ", "......"];

export function AsciiSpinner({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length);
    }, 140);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span
      aria-label={label}
      className={cn(
        "inline-block w-[6ch] overflow-hidden font-mono text-[10px] leading-none tracking-normal whitespace-pre text-zinc-400",
        className,
      )}
      role="status"
    >
      {frames[frameIndex]}
    </span>
  );
}
