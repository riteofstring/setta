import { useEffect, useState } from "react";

import { cn } from "../lib/utils";

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function BrailleSpinner({
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
        "inline-block w-[1ch] overflow-hidden font-mono text-[10px] leading-none tracking-normal whitespace-pre text-muted-foreground",
        className,
      )}
      role="status"
    >
      {frames[frameIndex]}
    </span>
  );
}

export function AsciiSpinner(props: { className?: string; label?: string }) {
  return <BrailleSpinner {...props} />;
}
