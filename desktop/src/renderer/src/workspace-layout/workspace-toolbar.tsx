import {
  Columns2,
  Globe,
  MessageSquarePlus,
  Plus,
  Settings,
  Sparkles,
  Terminal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  type ComponentType,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import { FloatingMenu } from "../components/floating-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import type { WorkspaceLayoutStore } from "./layout-store";
import type { EmptyFrameOption } from "./surface-adapters";
import type { WorkspacePane, OpenPaneRequest, SurfaceKind } from "./types";

export function WorkspaceToolbar({
  onNativeOverlayActiveChange,
  openPane,
  overviewActive,
  performanceStatsRef,
  runLayoutAction,
  showPerformanceStats,
  store,
}: {
  onNativeOverlayActiveChange?: (active: boolean) => void;
  openPane: (request: OpenPaneRequest) => void;
  overviewActive: boolean;
  performanceStatsRef: RefObject<HTMLDivElement | null> | null;
  runLayoutAction: (action: () => void) => void;
  showPerformanceStats: boolean;
  store: WorkspaceLayoutStore;
}) {
  const OverviewIcon = overviewActive ? ZoomIn : ZoomOut;
  const newFrameItems = openPaneActions.map(({ Icon, label, request }) => {
    const limitState = store.paneLimitState(request);
    const capped = limitState.limit !== null;
    const shortcutText = shortcutLabelForAction(label);
    const meta = [capped ? `${limitState.count}/${limitState.limit}` : null, shortcutText].filter(
      (value): value is string => value !== null,
    );
    return {
      Icon,
      disabled: !limitState.allowed,
      label,
      meta: meta.length > 0 ? meta.join(" ") : undefined,
      onSelect: () => openPane(request),
    };
  });
  return (
    <div className="workspace-toolbar" data-testid="workspace-toolbar">
      <TooltipProvider>
        <div className="workspace-toolbar-group">
          <WorkspaceToolbarButton
            active={overviewActive}
            label={overviewActive ? "Exit overview" : "Enter overview"}
            onClick={() => runLayoutAction(() => store.toggleOverviewMode())}
          >
            <OverviewIcon className="h-3.5 w-3.5" />
          </WorkspaceToolbarButton>
          <WorkspaceToolbarMenu
            Icon={Plus}
            items={newFrameItems}
            label="New frame"
            onOpenChange={onNativeOverlayActiveChange}
          />
        </div>
      </TooltipProvider>
      <div className="workspace-toolbar-spacer" aria-hidden={!showPerformanceStats}>
        {showPerformanceStats ? (
          <div
            aria-live="off"
            className="workspace-performance-stats"
            data-testid="workspace-performance-stats"
            ref={performanceStatsRef}
          >
            frame 0.00ms | p95 0.00ms | p99 0.00ms | visible 0 | writes 0 | long 0 | react 0 |
            runtime 0/0/0/0
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const openPaneActions = [
  {
    Icon: MessageSquarePlus,
    label: "Chat",
    request: openPaneRequest("Chat", "chat workspace surface", "chat-dom", "cyan"),
    shortcutKey: "c",
  },
  {
    Icon: Sparkles,
    label: "Easy Button",
    request: {
      ...openPaneRequest("Easy Button", "one request surface", "easy-button", "cyan"),
      widthSpec: { unit: "proportion", value: 1 },
    },
    shortcutKey: "e",
  },
  {
    Icon: Globe,
    label: "Browser",
    request: openPaneRequest("Browser", "browser surface", "browser", "green"),
    shortcutKey: "b",
  },
  {
    Icon: Terminal,
    label: "Terminal",
    request: openPaneRequest("Terminal", "command surface", "terminal", "green"),
    shortcutKey: "t",
  },
  {
    Icon: Settings,
    label: "Settings",
    request: openPaneRequest("Settings", "workspace settings", "settings-dom", "slate"),
    shortcutKey: "s",
  },
  {
    Icon: Columns2,
    label: "Workflow Graph",
    request: openPaneRequest("Workflow Graph", "workflow graph", "workflow-graph", "cyan"),
    shortcutKey: "v",
  },
] satisfies Array<{
  Icon: ComponentType<{ className?: string }>;
  label: string;
  request: OpenPaneRequest;
  shortcutKey: string;
}>;

export function openPaneActionForSurfaceKind(surfaceKind: string) {
  return openPaneActions.find((action) => action.request.surfaceKind === surfaceKind) ?? null;
}

export function emptyFrameOptionsForStore(store: WorkspaceLayoutStore): EmptyFrameOption[] {
  return openPaneActions.map(({ label, request }) => {
    const limitState = store.paneLimitState(request);
    const capped = limitState.limit !== null;
    const shortcut = shortcutLabelForAction(label);
    const meta = [capped ? `${limitState.count}/${limitState.limit}` : null, shortcut].filter(
      (value): value is string => value !== null,
    );
    return {
      disabled: !limitState.allowed,
      label,
      meta: meta.length > 0 ? meta.join(" ") : undefined,
      surfaceKind: request.surfaceKind ?? "empty-frame",
    };
  });
}

function WorkspaceToolbarButton({
  active = false,
  children,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <button
          aria-label={label}
          aria-pressed={active}
          className="workspace-toolbar-button app-no-drag"
          onClick={onClick}
          type="button"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

interface WorkspaceToolbarMenuItem {
  disabled?: boolean;
  Icon: ComponentType<{ className?: string }>;
  label: string;
  meta?: string;
  onSelect: () => void;
}

function WorkspaceToolbarMenu({
  Icon,
  items,
  label,
  onOpenChange,
}: {
  Icon: ComponentType<{ className?: string }>;
  items: readonly WorkspaceToolbarMenuItem[];
  label: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onOpenChange?.(open);
    return () => {
      if (open) {
        onOpenChange?.(false);
      }
    };
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="workspace-toolbar-menu-root app-no-drag" ref={rootRef}>
      <Tooltip>
        <TooltipTrigger>
          <button
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={label}
            className="workspace-toolbar-menu-button app-no-drag"
            onClick={() => setOpen((current) => !current)}
            onPointerDown={(event) => event.stopPropagation()}
            ref={anchorRef}
            type="button"
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <FloatingMenu
        anchorRef={anchorRef}
        ariaLabel={`${label} options`}
        className="workspace-toolbar-menu"
        menuRef={menuRef}
        open={open}
        placement="bottom"
        role="menu"
      >
        {items.map(({ disabled = false, Icon: ItemIcon, label: itemLabel, meta, onSelect }) => (
          <button
            className="workspace-toolbar-menu-item app-no-drag"
            disabled={disabled}
            key={itemLabel}
            onClick={() => {
              if (disabled) {
                return;
              }
              setOpen(false);
              onSelect();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            role="menuitem"
            title={disabled ? `${itemLabel} limit reached` : itemLabel}
            type="button"
          >
            <ItemIcon className="h-3.5 w-3.5 shrink-0" />
            <span>{itemLabel}</span>
            {meta ? <span className="workspace-toolbar-menu-item-meta">{meta}</span> : null}
          </button>
        ))}
      </FloatingMenu>
    </div>
  );
}

function shortcutLabelForAction(label: string): string | null {
  const action = openPaneActions.find((candidate) => candidate.label === label);
  return action ? `Mod+Alt+${action.shortcutKey.toUpperCase()}` : null;
}

function openPaneRequest(
  title: string,
  subtitle: string,
  surfaceKind: SurfaceKind,
  tone: WorkspacePane["tone"],
): OpenPaneRequest {
  return {
    subtitle,
    surfaceKind,
    title,
    tone,
  };
}
