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
          className="absolute bottom-[calc(100%+0.55rem)] left-0 z-50 w-[min(395px,calc(100vw-2rem))] rounded-2xl border border-zinc-700/90 bg-zinc-800/95 p-3 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur"
          role="menu"
        >
          {permissionModes.map((mode) => (
            <button
              aria-checked={mode.id === selectedModeId}
              className="grid h-12 w-full grid-cols-[24px_minmax(0,1fr)_20px] items-center gap-3 rounded-xl px-2 text-left text-base text-zinc-100 hover:bg-zinc-700/75"
              key={mode.id}
              onClick={() => {
                setSelectedModeId(mode.id);
                setOpen(false);
              }}
              role="menuitemradio"
              type="button"
            >
              <span className="grid h-6 w-6 place-items-center text-zinc-300 [&>svg]:h-5 [&>svg]:w-5">
                {mode.icon}
              </span>
              <span className="truncate">{mode.label}</span>
              {mode.id === selectedModeId ? (
                <Check className="h-5 w-5 text-zinc-300" aria-hidden="true" />
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
          "inline-flex h-9 min-w-0 items-center gap-1.5 rounded-full px-3 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40",
          open ? "bg-zinc-700/80 text-zinc-100" : "bg-zinc-700/55",
        )}
        disabled={disabled}
        onClick={() => setOpen((isOpen) => !isOpen)}
        type="button"
      >
        <Settings className="h-4 w-4 shrink-0" />
        <span className="truncate">{permissionModeLabels[selectedModeId]}</span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>
    </div>
  );
}
