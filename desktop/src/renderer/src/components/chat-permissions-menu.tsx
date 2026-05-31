import { Check, ChevronDown, Hand, Settings, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";

type PermissionModeId = "default" | "auto-review" | "full-access" | "custom";

interface PermissionMode {
  icon: ReactNode;
  id: PermissionModeId;
  label: string;
}

const permissionModes = [
  { icon: <Hand />, id: "default", label: "Default permissions" },
  { icon: <ShieldCheck />, id: "auto-review", label: "Auto-review" },
  { icon: <ShieldAlert />, id: "full-access", label: "Full access" },
  { icon: <Settings />, id: "custom", label: "Custom (config.toml)" },
] satisfies PermissionMode[];

const permissionModeLabels = {
  "auto-review": "Auto-review",
  custom: "Custom",
  default: "Default permissions",
  "full-access": "Full access",
} satisfies Record<PermissionModeId, string>;

export function ChatPermissionsMenu({
  disabled,
  initialOpen = false,
}: {
  disabled: boolean;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [selectedModeId, setSelectedModeId] = useState<PermissionModeId>("custom");
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
          aria-label="Chat permissions"
          className="absolute bottom-[calc(100%+0.4rem)] left-0 z-50 w-[min(320px,calc(100vw-2rem))] rounded-md border border-zinc-700/90 bg-zinc-800/95 p-1.5 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur"
          role="menu"
        >
          {permissionModes.map((mode) => (
            <button
              aria-checked={mode.id === selectedModeId}
              className="grid h-8 w-full grid-cols-[20px_minmax(0,1fr)_16px] items-center gap-2 rounded-md px-2 text-left text-xs text-zinc-100 hover:bg-zinc-700/75"
              key={mode.id}
              onClick={() => {
                setSelectedModeId(mode.id);
                setOpen(false);
              }}
              role="menuitemradio"
              type="button"
            >
              <span className="grid h-5 w-5 place-items-center text-zinc-300 [&>svg]:h-3.5 [&>svg]:w-3.5">
                {mode.icon}
              </span>
              <span className="truncate">{mode.label}</span>
              {mode.id === selectedModeId ? (
                <Check className="h-3.5 w-3.5 text-zinc-300" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Chat permissions"
        className={cn(
          "inline-flex h-6 min-w-0 items-center gap-1 rounded-md px-1.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40",
          open ? "bg-zinc-700/80 text-zinc-100" : "bg-zinc-700/55",
        )}
        disabled={disabled}
        onClick={() => setOpen((isOpen) => !isOpen)}
        type="button"
      >
        <Settings className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{permissionModeLabels[selectedModeId]}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>
    </div>
  );
}
