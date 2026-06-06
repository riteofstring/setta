import type { WorkspaceSummary } from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";
import {
  Maximize2,
  MessageSquareText,
  Minimize2,
  PanelBottomOpen,
  PanelLeftOpen,
  PanelRightOpen,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { cn } from "../lib/utils";
import { useChatStore } from "../stores/chat-store";
import { EditorPicker } from "./editor-picker";

export type MaximizedPane = "bottom" | "chat" | "right" | null;

export function AppChromeControls({
  bottomPaneOpen,
  chatPaneOpen,
  maximizedPane,
  maximizeTarget,
  openChatSearch,
  platform,
  projectPaneOpen,
  rightPaneOpen,
  selectedWorkspace,
  setBottomPaneOpen,
  setChatPaneOpen,
  setProjectPaneOpen,
  setRightPaneOpen,
  toggleMaximizedPane,
}: {
  bottomPaneOpen: boolean;
  chatPaneOpen: boolean;
  maximizedPane: MaximizedPane;
  maximizeTarget: NonNullable<MaximizedPane> | null;
  openChatSearch: () => void;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  rightPaneOpen: boolean;
  selectedWorkspace: WorkspaceSummary | null;
  setBottomPaneOpen: (open: boolean) => void;
  setChatPaneOpen: (open: boolean) => void;
  setProjectPaneOpen: (open: boolean) => void;
  setRightPaneOpen: (open: boolean) => void;
  toggleMaximizedPane: (pane: NonNullable<MaximizedPane>) => void;
}) {
  const createConversation = useChatStore((state) => state.createConversation);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!isModShortcut(event)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        openChatSearch();
        return;
      }
      if (key === "n") {
        event.preventDefault();
        void createConversation();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
    };
  }, [createConversation, openChatSearch]);

  return (
    <>
      <ShellTopBar />
      <FloatingPaneControls
        bottomPaneOpen={bottomPaneOpen}
        chatPaneOpen={chatPaneOpen}
        platform={platform}
        projectPaneOpen={projectPaneOpen}
        rightPaneOpen={rightPaneOpen}
        rootPath={selectedWorkspace?.rootPath ?? ""}
        maximizedPane={maximizedPane}
        maximizeTarget={maximizeTarget}
        setBottomPaneOpen={setBottomPaneOpen}
        setChatPaneOpen={setChatPaneOpen}
        setProjectPaneOpen={setProjectPaneOpen}
        setRightPaneOpen={setRightPaneOpen}
        toggleMaximizedPane={toggleMaximizedPane}
      />
    </>
  );
}

function ShellTopBar() {
  return (
    <div
      aria-hidden="true"
      className="app-drag pointer-events-auto fixed inset-x-0 top-0 z-30 h-8 bg-transparent"
      data-testid="shell-top-bar"
    />
  );
}

function isModShortcut(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey;
}

function FloatingPaneControls({
  bottomPaneOpen,
  chatPaneOpen,
  platform,
  projectPaneOpen,
  rightPaneOpen,
  rootPath,
  maximizedPane,
  maximizeTarget,
  setBottomPaneOpen,
  setChatPaneOpen,
  setProjectPaneOpen,
  setRightPaneOpen,
  toggleMaximizedPane,
}: {
  bottomPaneOpen: boolean;
  chatPaneOpen: boolean;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  rightPaneOpen: boolean;
  rootPath: string;
  maximizedPane: MaximizedPane;
  maximizeTarget: NonNullable<MaximizedPane> | null;
  setBottomPaneOpen: (open: boolean) => void;
  setChatPaneOpen: (open: boolean) => void;
  setProjectPaneOpen: (open: boolean) => void;
  setRightPaneOpen: (open: boolean) => void;
  toggleMaximizedPane: (pane: NonNullable<MaximizedPane>) => void;
}) {
  return (
    <div
      className={cn(
        "app-no-drag pointer-events-none fixed top-1 z-50 flex items-center gap-1 text-zinc-400",
        floatingControlsRightInsetClass(platform),
      )}
    >
      <div className="pointer-events-auto flex items-center gap-1 transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]">
        <EditorPicker rootPath={rootPath} />
        <ShellPaneToggle
          active={projectPaneOpen}
          label={projectPaneOpen ? "Hide project sidebar" : "Show project sidebar"}
          onClick={() => setProjectPaneOpen(!projectPaneOpen)}
        >
          <PanelLeftOpen className="h-3.5 w-3.5" />
        </ShellPaneToggle>
        <ShellPaneToggle
          active={chatPaneOpen}
          label={chatPaneOpen ? "Hide chat pane" : "Show chat pane"}
          onClick={() => setChatPaneOpen(!chatPaneOpen)}
        >
          <MessageSquareText className="h-3.5 w-3.5" />
        </ShellPaneToggle>
        <ShellPaneToggle
          active={bottomPaneOpen}
          label={bottomPaneOpen ? "Hide bottom pane" : "Show bottom pane"}
          onClick={() => setBottomPaneOpen(!bottomPaneOpen)}
        >
          <PanelBottomOpen className="h-3.5 w-3.5" />
        </ShellPaneToggle>
        <ShellPaneToggle
          active={rightPaneOpen}
          label={rightPaneOpen ? "Hide right pane" : "Show right pane"}
          onClick={() => setRightPaneOpen(!rightPaneOpen)}
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
        </ShellPaneToggle>
        <TopBarMaximizeButton
          maximizedPane={maximizedPane}
          maximizeTarget={maximizeTarget}
          toggleMaximizedPane={toggleMaximizedPane}
        />
      </div>
    </div>
  );
}

function ShellPaneToggle({
  active,
  children,
  label,
  onClick,
  disabled = false,
}: {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={
        active
          ? "inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-100 outline-none hover:bg-zinc-800 focus-visible:bg-zinc-800"
          : "inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 outline-none hover:bg-zinc-800 hover:text-zinc-100 focus-visible:bg-zinc-800 focus-visible:text-zinc-100"
      }
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function TopBarMaximizeButton({
  maximizedPane,
  maximizeTarget,
  toggleMaximizedPane,
}: {
  maximizedPane: MaximizedPane;
  maximizeTarget: NonNullable<MaximizedPane> | null;
  toggleMaximizedPane: (pane: NonNullable<MaximizedPane>) => void;
}) {
  const active = maximizeTarget !== null && maximizedPane === maximizeTarget;
  const label =
    maximizeTarget === null ? "Maximize pane" : maximizeButtonLabel(maximizeTarget, active);
  return (
    <button
      aria-hidden={maximizeTarget === null}
      aria-label={label}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-sm outline-none transition-[opacity,transform,background-color,color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
        active
          ? "text-zinc-100 hover:bg-zinc-800 focus-visible:bg-zinc-800"
          : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:bg-zinc-800 focus-visible:text-zinc-100",
        maximizeTarget === null && "pointer-events-none translate-x-1 opacity-0",
      )}
      disabled={maximizeTarget === null}
      onClick={() => {
        if (maximizeTarget !== null) {
          toggleMaximizedPane(maximizeTarget);
        }
      }}
      title={maximizeTarget === null ? undefined : label}
      type="button"
    >
      {active ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
    </button>
  );
}

function maximizeButtonLabel(pane: NonNullable<MaximizedPane>, active: boolean) {
  return `${active ? "Restore" : "Maximize"} ${paneLabel(pane)} pane`;
}

function paneLabel(pane: NonNullable<MaximizedPane>) {
  switch (pane) {
    case "bottom":
      return "bottom";
    case "chat":
      return "chat";
    case "right":
      return "right";
    default:
      return assertNever(pane);
  }
}

function floatingControlsRightInsetClass(platform: DesktopPlatform) {
  return platform === "darwin" ? "right-2" : "right-36";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${value}`);
}
