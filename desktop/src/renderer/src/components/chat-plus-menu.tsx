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
          className="absolute bottom-[calc(100%+0.55rem)] left-0 z-50 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-zinc-700/90 bg-zinc-800/95 p-2 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur"
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
              "grid h-11 w-full grid-cols-[24px_minmax(0,1fr)_20px] items-center gap-3 rounded-xl px-2 text-left text-base text-zinc-100 hover:bg-zinc-700/75",
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
            <ChevronRight className="h-5 w-5 text-zinc-400" aria-hidden="true" />
          </button>
          {pluginSubmenuOpen ? <PluginSubmenu /> : null}
        </div>
      ) : null}
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Add context"
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40",
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
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

function MenuItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button
      className="grid h-11 w-full grid-cols-[24px_minmax(0,1fr)] items-center gap-3 rounded-xl px-2 text-left text-base text-zinc-100 hover:bg-zinc-700/75"
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
      className="grid h-11 w-full grid-cols-[24px_minmax(0,1fr)_56px] items-center gap-3 rounded-xl px-2 text-left text-base text-zinc-100 hover:bg-zinc-700/75"
      onClick={onClick}
      role="menuitemcheckbox"
      type="button"
    >
      <MenuIcon>{icon}</MenuIcon>
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "relative h-7 w-14 rounded-full transition-colors",
          checked ? "bg-zinc-100" : "bg-zinc-700",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-transform",
            checked ? "translate-x-7 bg-zinc-950" : "translate-x-1 bg-zinc-50",
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
      className="absolute bottom-0 left-[calc(100%-0.35rem)] z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-zinc-700/90 bg-zinc-800/95 p-4 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur"
      role="menu"
    >
      <div className="mb-2 text-base text-zinc-400">4 installed plugins</div>
      <div className="grid gap-1">
        {pluginItems.map((item) => (
          <button
            className="grid h-11 w-full grid-cols-[28px_minmax(0,1fr)] items-center gap-3 rounded-xl text-left text-base text-zinc-100 hover:bg-zinc-700/75"
            key={item.label}
            role="menuitem"
            type="button"
          >
            <span
              className={cn(
                "grid h-7 w-7 place-items-center rounded-md [&>svg]:h-4 [&>svg]:w-4",
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
  return <div className="mx-4 my-2 h-px bg-zinc-700/80" />;
}

function MenuIcon({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-6 w-6 place-items-center text-zinc-300 [&>svg]:h-5 [&>svg]:w-5">
      {children}
    </span>
  );
}
