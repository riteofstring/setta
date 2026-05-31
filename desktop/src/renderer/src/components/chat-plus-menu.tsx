import {
  Blocks,
  CheckSquare,
  ChevronRight,
  FileText,
  Globe2,
  Monitor,
  Paperclip,
  Plus,
  Presentation,
  Sheet,
  Target,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";

interface PluginItem {
  accentClass: string;
  icon: ReactNode;
  label: string;
}

const pluginItems = [
  {
    accentClass: "bg-blue-500/80 text-blue-50",
    icon: <FileText />,
    label: "Documents",
  },
  {
    accentClass: "bg-green-600/80 text-green-50",
    icon: <Sheet />,
    label: "Spreadsheets",
  },
  {
    accentClass: "bg-amber-600/80 text-amber-50",
    icon: <Presentation />,
    label: "Presentations",
  },
  {
    accentClass: "bg-sky-500/80 text-sky-50",
    icon: <Globe2 />,
    label: "Browser",
  },
] satisfies PluginItem[];

export function ChatPlusMenu({
  disabled,
  initialOpen = false,
  initialPluginSubmenuOpen = false,
}: {
  disabled: boolean;
  initialOpen?: boolean;
  initialPluginSubmenuOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [planMode, setPlanMode] = useState(false);
  const [pluginSubmenuOpen, setPluginSubmenuOpen] = useState(initialPluginSubmenuOpen);
  const [pursueGoal, setPursueGoal] = useState(false);
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
      setPluginSubmenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setPluginSubmenuOpen(false);
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
          aria-label="Add context"
          className="absolute bottom-[calc(100%+0.4rem)] left-0 z-50 w-[min(280px,calc(100vw-2rem))] rounded-md border border-zinc-700/90 bg-zinc-800/95 p-1.5 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur"
          role="menu"
        >
          <MenuItem icon={<Paperclip />} label="Add photos & files" />
          <MenuItem icon={<Monitor />} label="Attach Electron" />
          <MenuDivider />
          <SwitchMenuItem
            checked={planMode}
            icon={<CheckSquare />}
            label="Plan mode"
            onClick={() => setPlanMode((enabled) => !enabled)}
          />
          <SwitchMenuItem
            checked={pursueGoal}
            icon={<Target />}
            label="Pursue goal"
            onClick={() => setPursueGoal((enabled) => !enabled)}
          />
          <MenuDivider />
          <button
            aria-expanded={pluginSubmenuOpen}
            aria-haspopup="menu"
            className={cn(
              "grid h-8 w-full grid-cols-[20px_minmax(0,1fr)_16px] items-center gap-2 rounded-md px-2 text-left text-xs text-zinc-100 hover:bg-zinc-700/75",
              pluginSubmenuOpen ? "bg-zinc-700/80" : "",
            )}
            onClick={() => setPluginSubmenuOpen((isOpen) => !isOpen)}
            onFocus={() => setPluginSubmenuOpen(true)}
            onMouseEnter={() => setPluginSubmenuOpen(true)}
            role="menuitem"
            type="button"
          >
            <MenuIcon>{<Blocks />}</MenuIcon>
            <span className="truncate">Plugins</span>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          </button>
          {pluginSubmenuOpen ? <PluginSubmenu /> : null}
        </div>
      ) : null}
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Add context"
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40",
          open ? "bg-zinc-700/80 text-zinc-100" : "",
        )}
        disabled={disabled}
        onClick={() => {
          setOpen((isOpen) => !isOpen);
          if (open) {
            setPluginSubmenuOpen(false);
          }
        }}
        type="button"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function MenuItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button
      className="grid h-8 w-full grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left text-xs text-zinc-100 hover:bg-zinc-700/75"
      role="menuitem"
      type="button"
    >
      <MenuIcon>{icon}</MenuIcon>
      <span className="truncate">{label}</span>
    </button>
  );
}

function SwitchMenuItem({
  checked,
  icon,
  label,
  onClick,
}: {
  checked: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      className="grid h-8 w-full grid-cols-[20px_minmax(0,1fr)_34px] items-center gap-2 rounded-md px-2 text-left text-xs text-zinc-100 hover:bg-zinc-700/75"
      onClick={onClick}
      role="menuitemcheckbox"
      type="button"
    >
      <MenuIcon>{icon}</MenuIcon>
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "relative h-5 w-9 rounded-sm transition-colors",
          checked ? "bg-zinc-100" : "bg-zinc-700",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-sm transition-transform",
            checked ? "translate-x-5 bg-zinc-950" : "translate-x-1 bg-zinc-50",
          )}
        />
      </span>
    </button>
  );
}

function PluginSubmenu() {
  return (
    <div
      aria-label="Installed plugins"
      className="absolute bottom-0 left-[calc(100%-0.35rem)] z-50 w-[min(300px,calc(100vw-2rem))] rounded-md border border-zinc-700/90 bg-zinc-800/95 p-2 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur"
      role="menu"
    >
      <div className="mb-1 px-1 text-xs text-zinc-400">4 installed plugins</div>
      <div className="grid gap-1">
        {pluginItems.map((item) => (
          <button
            className="grid h-8 w-full grid-cols-[22px_minmax(0,1fr)] items-center gap-2 rounded-md px-1 text-left text-xs text-zinc-100 hover:bg-zinc-700/75"
            key={item.label}
            role="menuitem"
            type="button"
          >
            <span
              className={cn(
                "grid h-5 w-5 place-items-center rounded [&>svg]:h-3.5 [&>svg]:w-3.5",
                item.accentClass,
              )}
            >
              {item.icon}
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MenuDivider() {
  return <div className="mx-2 my-1 h-px bg-zinc-700/80" />;
}

function MenuIcon({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-5 w-5 place-items-center text-zinc-300 [&>svg]:h-3.5 [&>svg]:w-3.5">
      {children}
    </span>
  );
}
