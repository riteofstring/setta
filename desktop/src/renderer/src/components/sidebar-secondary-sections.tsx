import { BookOpen, Database, FileText, FolderOpen, Inbox, Workflow, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export interface SidebarListItem {
  id: string;
  subtitle?: string;
  title: string;
}

export function UnorganizedChatsContent({ chats }: { chats: SidebarListItem[] }) {
  if (chats.length === 0) {
    return <EmptySectionIcon label="Chats" />;
  }
  return <SidebarIndentedListItems items={chats} />;
}

// Notes are app-local Markdown documents for now. Keep the boundary narrow so a
// future Markdown/WYSIWYG editor can replace the empty state without changing
// project chat or external memory integration contracts.
export function NotesContent({ notes }: { notes: SidebarListItem[] }) {
  if (notes.length === 0) {
    return <EmptySectionIcon label="Notes" />;
  }
  return <SidebarIndentedListItems items={notes} />;
}

function SidebarIndentedListItems({ items }: { items: SidebarListItem[] }) {
  return (
    <div className="grid gap-0.5 py-0.5">
      {items.map((item) => (
        <button
          className="grid h-7 w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-400 hover:bg-zinc-800/55 hover:text-zinc-100"
          data-testid="sidebar-indented-list-item"
          key={item.id}
          type="button"
        >
          <span aria-hidden="true" className="h-4 w-[18px]" />
          <span className="truncate">{item.title}</span>
          {item.subtitle ? (
            <span className="text-[11px] text-zinc-600">{item.subtitle}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
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

// Rules are planned as Setta node-graph canvases. A rule can later be selected
// beside the chat permissions control or invoked through slash commands, then
// evaluated before or during every user turn.
export function RulesContent() {
  return <EmptySectionIcon label="Rules" />;
}

export function EmptySectionIcon({ label }: { label: string }) {
  return (
    <div
      aria-label={`${label} empty`}
      className="grid h-10 place-items-center text-zinc-700"
      role="status"
    >
      <Inbox className="h-4 w-4" aria-hidden="true" />
    </div>
  );
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
            label="Folder"
          />
          <MemoryIntegrationOption
            description="Vault or library"
            icon={<BookOpen className="h-3.5 w-3.5" />}
            label="Obsidian"
          />
          <MemoryIntegrationOption
            description="Queryable Markdown"
            icon={<FileText className="h-3.5 w-3.5" />}
            label="QMD"
          />
          <MemoryIntegrationOption
            description="Graph memory"
            icon={<Workflow className="h-3.5 w-3.5" />}
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
  label,
}: {
  description: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      className="grid h-8 w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
      type="button"
    >
      <span className="text-zinc-500">{icon}</span>
      <span className="truncate">{label}</span>
      <span className="truncate text-[11px] text-zinc-600">{description}</span>
    </button>
  );
}
