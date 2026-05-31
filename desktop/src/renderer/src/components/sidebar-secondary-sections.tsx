import {
  BookOpen,
  Database,
  FileText,
  FolderOpen,
  Settings,
  Terminal,
  Workflow,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import settaSLogo from "../../../../img/logo/s-logo-only-og.svg";

export type SidebarListItemKind = "canvas" | "chat" | "note" | "rule" | "terminal";
export type SidebarUtilityKind = Extract<SidebarListItemKind, "canvas" | "chat" | "terminal">;

export interface SidebarListItem {
  id: string;
  kind?: SidebarListItemKind;
  subtitle?: string;
  title: string;
}

export function createSidebarListItem(
  kind: SidebarListItemKind,
  existingItems: SidebarListItem[],
  scope: string,
): SidebarListItem {
  const kindCount = existingItems.filter((item) => item.kind === kind).length;
  const baseTitle = sidebarItemBaseTitle(kind);
  return {
    id: `${scope}_${kind}_${Date.now()}_${existingItems.length}`,
    kind,
    subtitle: sidebarItemSubtitle(kind),
    title: kindCount === 0 ? baseTitle : `${baseTitle} ${kindCount + 1}`,
  };
}

export function SettaCanvasIcon() {
  return (
    <img alt="" className="h-3.5 w-3.5 opacity-75 grayscale" draggable={false} src={settaSLogo} />
  );
}

export function UnorganizedChatsContent({ chats }: { chats: SidebarListItem[] }) {
  if (chats.length === 0) {
    return <EmptySectionSpace />;
  }
  return <SidebarIndentedListItems items={chats} />;
}

// Notes are app-local Markdown documents for now. Keep the boundary narrow so a
// future Markdown/WYSIWYG editor can replace the empty state without changing
// project chat or external memory integration contracts.
export function NotesContent({ notes }: { notes: SidebarListItem[] }) {
  if (notes.length === 0) {
    return <EmptySectionSpace />;
  }
  return <SidebarIndentedListItems items={notes} />;
}

export function SidebarIndentedListItems({ items }: { items: SidebarListItem[] }) {
  return (
    <div className="grid gap-0.5 py-0.5">
      {items.map((item) => (
        <button
          className="grid h-7 w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-400 hover:bg-zinc-800/55 hover:text-zinc-100"
          data-testid="sidebar-indented-list-item"
          key={item.id}
          type="button"
        >
          <span aria-hidden="true" className="grid h-4 w-[18px] place-items-center text-zinc-500">
            <SidebarItemIcon kind={item.kind} />
          </span>
          <span className="truncate">{item.title}</span>
          {item.subtitle ? (
            <span className="text-[11px] text-zinc-600">{item.subtitle}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function SidebarItemIcon({ kind }: { kind?: SidebarListItemKind }) {
  switch (kind) {
    case "canvas":
      return <SettaCanvasIcon />;
    case "terminal":
      return <Terminal className="h-3.5 w-3.5" />;
    case "chat":
    case "note":
    case "rule":
    case undefined:
      return null;
    default:
      return assertSidebarItemKind(kind);
  }
}

function sidebarItemBaseTitle(kind: SidebarListItemKind) {
  switch (kind) {
    case "canvas":
      return "Setta canvas";
    case "chat":
      return "New chat";
    case "note":
      return "Untitled note";
    case "rule":
      return "New rule";
    case "terminal":
      return "Terminal";
    default:
      return assertSidebarItemKind(kind);
  }
}

function sidebarItemSubtitle(kind: SidebarListItemKind) {
  switch (kind) {
    case "canvas":
      return "canvas";
    case "chat":
      return "now";
    case "note":
      return "local";
    case "rule":
      return "node graph";
    case "terminal":
      return "terminal";
    default:
      return assertSidebarItemKind(kind);
  }
}

// External memories should be provider-backed later: local folders, Obsidian
// vaults/libraries, qmd stores, cognee graphs, or other richer memory systems.
export function MemoryIntegrationsContent() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-w-0">
      <button
        className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-400 hover:bg-zinc-800/55 hover:text-zinc-100"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Database className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="min-w-0 flex-1 truncate font-medium">DB / Memories</span>
        <span className="text-[11px] text-zinc-600">Integrations</span>
      </button>
      <MemoryIntegrationsModal onOpenChange={setOpen} open={open} />
    </div>
  );
}

export function SidebarSettingsButton({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <button
      aria-label="Open settings"
      className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-400 hover:bg-zinc-800/55 hover:text-zinc-100"
      onClick={onOpenSettings}
      type="button"
    >
      <Settings className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
      <span className="min-w-0 flex-1 truncate font-medium">Settings</span>
      <span className="text-[11px] text-zinc-600">Right pane</span>
    </button>
  );
}

// Rules are planned as Setta node-graph canvases. A rule can later be selected
// beside the chat permissions control or invoked through slash commands, then
// evaluated before or during every user turn.
export function RulesContent({ rules }: { rules: SidebarListItem[] }) {
  if (rules.length === 0) {
    return <EmptySectionSpace />;
  }
  return <SidebarIndentedListItems items={rules} />;
}

export function EmptySectionSpace() {
  return <div aria-hidden="true" className="h-10" data-testid="sidebar-empty-space" />;
}

function MemoryIntegrationsModal({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/35 px-3 pt-12"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
      role="presentation"
    >
      <div
        aria-label="Memory integrations"
        className="mx-auto w-full max-w-sm overflow-hidden rounded-sm border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-xl shadow-black/40"
        role="dialog"
      >
        <div className="flex h-8 items-center justify-between border-b border-zinc-800 px-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Database className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <h2 className="truncate text-xs font-medium">DB / Memories</h2>
          </div>
          <button
            aria-label="Close memory integrations"
            className="grid h-5 w-5 place-items-center rounded-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid gap-0.5 p-1">
          <MemoryIntegrationOption
            description="Markdown and QMD files"
            icon={<FolderOpen className="h-3.5 w-3.5" />}
            integration="folder"
            label="Folder"
          />
          <MemoryIntegrationOption
            description="Vault or library"
            icon={<BookOpen className="h-3.5 w-3.5" />}
            integration="obsidian"
            label="Obsidian"
          />
          <MemoryIntegrationOption
            description="Queryable Markdown"
            icon={<FileText className="h-3.5 w-3.5" />}
            integration="qmd"
            label="QMD"
          />
          <MemoryIntegrationOption
            description="Graph memory"
            icon={<Workflow className="h-3.5 w-3.5" />}
            integration="cognee"
            label="Cognee"
          />
        </div>
      </div>
    </div>
  );
}

function MemoryIntegrationOption({
  description,
  icon,
  integration,
  label,
}: {
  description: string;
  icon: ReactNode;
  integration: TemporaryMemoryIntegration;
  label: string;
}) {
  return (
    <button
      className="grid h-8 w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
      onClick={() => temporaryMemoryIntegrationNoop(integration)}
      type="button"
    >
      <span className="text-zinc-500">{icon}</span>
      <span className="truncate">{label}</span>
      <span className="truncate text-[11px] text-zinc-600">{description}</span>
    </button>
  );
}

type TemporaryMemoryIntegration = "cognee" | "folder" | "obsidian" | "qmd";

function temporaryMemoryIntegrationNoop(integration: TemporaryMemoryIntegration) {
  // Temporary no-op for new-layout memory integration controls without a setta-3 backend contract.
  void integration;
}

function assertSidebarItemKind(value: never): never {
  throw new Error(`Unhandled sidebar item kind: ${value}`);
}
