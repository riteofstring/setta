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
        "inline-block w-[1.1ch] font-mono text-sm leading-none tracking-normal whitespace-pre text-accent-violet [filter:drop-shadow(0_0_5px_currentColor)]",
        className,
      )}
      data-recording-volatile-text="true"
      role="status"
    >
      {frames[frameIndex]}
    </span>
  );
}

export function AsciiSpinner(props: { className?: string; label?: string }) {
  return <BrailleSpinner {...props} />;
}
