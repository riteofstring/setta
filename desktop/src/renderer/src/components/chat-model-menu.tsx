import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";

type ReasoningLevel = "low" | "medium" | "high" | "extra-high";

const reasoningLevels = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "extra-high", label: "Extra High" },
] satisfies { id: ReasoningLevel; label: string }[];

const reasoningLabels = {
  "extra-high": "Extra High",
  high: "High",
  low: "Low",
  medium: "Medium",
} satisfies Record<ReasoningLevel, string>;

export function ChatModelMenu({
  disabled,
  initialOpen = false,
}: {
  disabled: boolean;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [reasoningLevel, setReasoningLevel] = useState<ReasoningLevel>("extra-high");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      {open ? (
        <div
          aria-label="Chat model selection"
          className="absolute right-0 bottom-[calc(100%+0.4rem)] z-50 w-[min(340px,calc(100vw-2rem))] rounded-sm border border-zinc-700/90 bg-zinc-800/95 p-1.5 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur"
          role="menu"
        >
          <div className="px-2 pt-1 pb-1 text-xs text-zinc-400">Reasoning</div>
          {reasoningLevels.map((level) => (
            <button
              aria-checked={level.id === reasoningLevel}
              className={cn(
                "grid h-8 w-full grid-cols-[minmax(0,1fr)_16px] items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-100 hover:bg-zinc-700/75",
                level.id === reasoningLevel ? "bg-zinc-700/80" : "",
              )}
              key={level.id}
              onClick={() => {
                setReasoningLevel(level.id);
                setOpen(false);
              }}
              role="menuitemradio"
              type="button"
            >
              <span className="truncate">{level.label}</span>
              {level.id === reasoningLevel ? (
                <Check className="h-3.5 w-3.5 text-zinc-100" aria-hidden="true" />
              ) : null}
            </button>
          ))}
          <div className="mx-2 my-1 h-px bg-zinc-700/80" />
          <ModelSubmenuRow label="GPT-5.5" />
          <ModelSubmenuRow label="Speed" />
        </div>
      ) : null}
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Chat model selection"
        className={cn(
          "inline-flex h-6 min-w-0 items-center gap-1 rounded-sm px-1.5 text-xs hover:bg-zinc-700 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40",
          open ? "bg-zinc-700/80 text-zinc-100" : "text-zinc-400",
        )}
        disabled={disabled}
        onClick={() => setOpen((isOpen) => !isOpen)}
        type="button"
      >
        <span className="font-medium text-zinc-100">5.5</span>
        <span className="truncate text-zinc-500">{reasoningLabels[reasoningLevel]}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-zinc-400" />
      </button>
    </div>
  );
}

function ModelSubmenuRow({ label }: { label: string }) {
  return (
    <button
      className="grid h-8 w-full grid-cols-[minmax(0,1fr)_16px] items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-100 hover:bg-zinc-700/75"
      role="menuitem"
      type="button"
    >
      <span className="truncate">{label}</span>
      <ChevronRight className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
    </button>
  );
}
