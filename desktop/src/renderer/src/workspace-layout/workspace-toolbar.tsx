import { Globe, MessageSquarePlus, Plus, ZoomIn, ZoomOut } from "lucide-react";
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
import type {
  SurfaceFrameActionRequest,
  WorkspaceFrameAction,
  WorkspaceFrameActionPlacement,
} from "./workspace-frame-actions";
import {
  workspaceFrameActionAllowed,
  workspaceFrameActionLimitState,
} from "./workspace-frame-actions";
import type { WorkspacePane, NonEasyButtonSurfaceKind } from "./types";

export function WorkspaceToolbar({
  onFrameAction,
  onNativeOverlayActiveChange,
  overviewActive,
  performanceStatsRef,
  runLayoutAction,
  showPerformanceStats,
  store,
}: {
  onFrameAction: (action: WorkspaceFrameAction, placement: WorkspaceFrameActionPlacement) => void;
  onNativeOverlayActiveChange?: (active: boolean) => void;
  overviewActive: boolean;
  performanceStatsRef: RefObject<HTMLDivElement | null> | null;
  runLayoutAction: (action: () => void) => void;
  showPerformanceStats: boolean;
  store: WorkspaceLayoutStore;
}) {
  const OverviewIcon = overviewActive ? ZoomIn : ZoomOut;
  const newFrameItems = workspaceFrameActions.map(({ Icon, action, id, label }) => {
    const limitState = workspaceFrameActionLimitState(store, action);
    const limitMeta =
      limitState !== null && limitState.limit !== null
        ? `${limitState.count}/${limitState.limit}`
        : null;
    const shortcutText = shortcutLabelForAction(id);
    const meta = [limitMeta, shortcutText].filter((value): value is string => value !== null);
    return {
      Icon,
      disabled: !workspaceFrameActionAllowed(store, action),
      label,
      meta: meta.length > 0 ? meta.join(" ") : undefined,
      onSelect: () => onFrameAction(action, { kind: "new-pane" }),
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

export interface WorkspaceFrameActionDefinition {
  Icon: ComponentType<{ className?: string }>;
  action: WorkspaceFrameAction;
  id: string;
  label: string;
  shortcutKey: string | null;
}

export const workspaceFrameActions: readonly WorkspaceFrameActionDefinition[] = [
  {
    Icon: MessageSquarePlus,
    action: { kind: "conversation" },
    id: "conversation",
    label: "Conversation",
    shortcutKey: "c",
  },
  {
    Icon: Globe,
    action: {
      kind: "surface",
      request: openPaneRequest("Browser", "browser surface", "browser", "green"),
    },
    id: "browser",
    label: "Browser",
    shortcutKey: "b",
  },
];

export function workspaceFrameActionById(actionId: string): WorkspaceFrameActionDefinition | null {
  return workspaceFrameActions.find((action) => action.id === actionId) ?? null;
}

export function emptyFrameOptionsForStore(store: WorkspaceLayoutStore): EmptyFrameOption[] {
  return workspaceFrameActions.map(({ action, id, label }) => {
    const limitState = workspaceFrameActionLimitState(store, action);
    const limitMeta =
      limitState !== null && limitState.limit !== null
        ? `${limitState.count}/${limitState.limit}`
        : null;
    const shortcut = shortcutLabelForAction(id);
    const meta = [limitMeta, shortcut].filter((value): value is string => value !== null);
    return {
      actionId: id,
      label,
      meta: meta.length > 0 ? meta.join(" ") : undefined,
      disabled: !workspaceFrameActionAllowed(store, action),
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

function shortcutLabelForAction(actionId: string): string | null {
  const action = workspaceFrameActionById(actionId);
  return action?.shortcutKey ? `Mod+Alt+${action.shortcutKey.toUpperCase()}` : null;
}

function openPaneRequest(
  title: string,
  subtitle: string,
  surfaceKind: NonEasyButtonSurfaceKind,
  tone: WorkspacePane["tone"],
): SurfaceFrameActionRequest {
  return {
    subtitle,
    surfaceKind,
    title,
    tone,
  };
}
