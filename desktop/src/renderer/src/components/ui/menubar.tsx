import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@renderer/lib/utils";

interface MenubarItem {
  disabled?: boolean;
  label: string;
  onSelect?: () => void;
  shortcut?: string;
}

export interface MenubarMenu {
  items: MenubarItem[];
  label: string;
}

export function Menubar({ className, menus }: { className?: string; menus: MenubarMenu[] }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenu) {
      return;
    }
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);

  return (
    <div className={cn("flex items-center gap-1", className)} ref={rootRef} role="menubar">
      {menus.map((menu) => (
        <div className="relative" key={menu.label}>
          <button
            aria-expanded={openMenu === menu.label}
            aria-haspopup="menu"
            className={cn(
              "h-6 rounded px-2 text-xs text-zinc-200 hover:bg-zinc-800 hover:text-white",
              openMenu === menu.label && "bg-zinc-800 text-white",
            )}
            onClick={() => setOpenMenu((current) => (current === menu.label ? null : menu.label))}
            role="menuitem"
            type="button"
          >
            {menu.label}
          </button>
          {openMenu === menu.label ? (
            <div
              className="absolute top-full left-0 z-50 mt-1 min-w-44 rounded-md border border-zinc-700 bg-zinc-950 p-1 text-zinc-100 shadow-xl"
              role="menu"
            >
              {menu.items.map((item) => (
                <MenubarMenuItem item={item} key={item.label} onSelect={() => setOpenMenu(null)}>
                  {item.label}
                </MenubarMenuItem>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MenubarMenuItem({
  children,
  item,
  onSelect,
}: {
  children: ReactNode;
  item: MenubarItem;
  onSelect: () => void;
}) {
  return (
    <button
      className="flex h-7 w-full items-center justify-between gap-5 rounded px-2 text-left text-xs hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-40"
      disabled={item.disabled}
      onClick={() => {
        item.onSelect?.();
        onSelect();
      }}
      role="menuitem"
      type="button"
    >
      <span>{children}</span>
      {item.shortcut ? <kbd className="text-[10px] text-zinc-500">{item.shortcut}</kbd> : null}
    </button>
  );
}
