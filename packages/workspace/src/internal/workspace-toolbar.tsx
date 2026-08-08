import { useViewport } from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import type {
  WorkspaceController,
  WorkspaceGestureOptions,
  WorkspaceJsonValue,
  WorkspaceViewport,
} from "../core.js";
import type { WorkspaceToolbarControl, WorkspaceToolbarControlPlacement } from "../react.js";
import type { ScreenRect } from "./geometry-index.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import { workspaceViewportsMatch } from "./workspace-viewport-synchronizer.js";

type ResolvedToolbarControl = Readonly<{
  ariaControls?: string;
  disabled: boolean;
  icon: ReactNode;
  id: string;
  label: string;
  onPress(trigger: HTMLButtonElement): void;
  placement: WorkspaceToolbarControlPlacement;
  pressed?: boolean;
  source: "built-in" | "host";
}>;

type ToolbarControlGroup = Readonly<{
  controls: readonly ResolvedToolbarControl[];
  label: string;
  placement: WorkspaceToolbarControlPlacement;
}>;

type WorkspaceToolbarProps<TSectionData> = Readonly<{
  ariaLabel: string;
  canonicalViewport: WorkspaceViewport;
  controller: WorkspaceController<TSectionData>;
  creationControl: Readonly<{
    ariaControls: string;
    disabled: boolean;
    onPress(trigger: HTMLButtonElement): void;
  }> | null;
  gestureOptions: WorkspaceGestureOptions;
  getCanvasBounds(): ScreenRect;
  gridSnap: boolean;
  minimapId: string;
  minimapVisible: boolean;
  onGridSnapChange(value: boolean): void;
  onMinimapVisibilityChange(value: boolean): void;
  sectionIds: readonly string[];
  toolbarControls: readonly WorkspaceToolbarControl<TSectionData>[];
}>;

const toolbarPlacements = [
  "project",
  "viewport",
  "utility",
] as const satisfies readonly WorkspaceToolbarControlPlacement[];

function ToolbarIcon({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__toolbar-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      {children}
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <ToolbarIcon>
      <path d="M10 4.5v11M4.5 10h11" />
    </ToolbarIcon>
  );
}

function AddSectionIcon() {
  return (
    <ToolbarIcon>
      <rect height="13" rx="2" width="13" x="3.5" y="3.5" />
      <path d="M10 6.75v6.5M6.75 10h6.5" />
    </ToolbarIcon>
  );
}

function ZoomOutIcon() {
  return (
    <ToolbarIcon>
      <path d="M4.5 10h11" />
    </ToolbarIcon>
  );
}

function ResetZoomIcon() {
  return (
    <ToolbarIcon>
      <circle cx="10" cy="10" r="5.25" />
      <path d="M10 7.25v5.5M7.25 10h5.5" />
    </ToolbarIcon>
  );
}

function FitSectionsIcon() {
  return (
    <ToolbarIcon>
      <path d="M7.25 4.5H4.5v2.75M12.75 4.5h2.75v2.75M7.25 15.5H4.5v-2.75M12.75 15.5h2.75v-2.75" />
    </ToolbarIcon>
  );
}

function SnapGridIcon() {
  return (
    <ToolbarIcon>
      <circle cx="5" cy="5" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="5" cy="15" r="1" />
      <circle cx="15" cy="15" r="1" />
      <path d="M8 10h4M10 8v4" />
    </ToolbarIcon>
  );
}

function MinimapIcon() {
  return (
    <ToolbarIcon>
      <rect height="11" rx="1.5" width="14" x="3" y="4.5" />
      <rect height="2.5" rx="0.5" width="3.5" x="5" y="7" />
      <rect height="3" rx="0.5" width="4" x="11" y="10.5" />
    </ToolbarIcon>
  );
}

const TOOLBAR_ZOOM_FACTOR = 1.2;

function centeredZoomViewport(
  viewport: WorkspaceViewport,
  zoom: number,
  width: number,
  height: number,
): WorkspaceViewport {
  const scale = zoom / viewport.zoom;
  const centerX = width / 2;
  const centerY = height / 2;
  return {
    x: centerX - (centerX - viewport.x) * scale,
    y: centerY - (centerY - viewport.y) * scale,
    zoom,
  };
}

function toolbarFocusTarget(
  enabledIds: readonly string[],
  currentId: string | null,
  key: string,
): string | null {
  if (enabledIds.length === 0) {
    return null;
  }
  const boundaryIds: Readonly<Record<string, string | undefined>> = {
    End: enabledIds.at(-1),
    Home: enabledIds[0],
  };
  const boundaryId = boundaryIds[key];
  if (boundaryId) {
    return boundaryId;
  }
  const step: number | undefined = { ArrowDown: 1, ArrowUp: -1 }[key];
  if (step === undefined) {
    return null;
  }
  const currentIndex = Math.max(0, enabledIds.indexOf(currentId ?? ""));
  return enabledIds[(currentIndex + step + enabledIds.length) % enabledIds.length] ?? null;
}

function useToolbarFocus(controls: readonly ResolvedToolbarControl[]) {
  const enabledIds = useMemo(
    () => controls.filter((control) => !control.disabled).map((control) => control.id),
    [controls],
  );
  const enabledSignature = enabledIds.join("\u0000");
  const controlElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const focusedControlRef = useRef<string | null>(null);
  const [tabStopId, setTabStopId] = useState<string | null>(() => enabledIds[0] ?? null);

  useEffect(() => {
    if (tabStopId && enabledIds.includes(tabStopId)) {
      return;
    }
    const nextId = enabledIds[0] ?? null;
    const restoreFocus = focusedControlRef.current === tabStopId;
    setTabStopId(nextId);
    if (restoreFocus && nextId) {
      focusedControlRef.current = nextId;
      controlElementsRef.current.get(nextId)?.focus();
    }
  }, [enabledIds, enabledSignature, tabStopId]);

  const registerControl = useCallback((id: string, element: HTMLButtonElement | null) => {
    if (element) {
      controlElementsRef.current.set(id, element);
    } else {
      controlElementsRef.current.delete(id);
    }
  }, []);
  const handleFocus = useCallback((id: string) => {
    focusedControlRef.current = id;
    setTabStopId(id);
  }, []);
  const handleBlur = useCallback(() => {
    focusedControlRef.current = null;
  }, []);
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const targetId = toolbarFocusTarget(
        enabledIds,
        event.currentTarget.dataset.workspaceControlId ?? null,
        event.key,
      );
      if (!targetId) {
        return;
      }
      event.preventDefault();
      focusedControlRef.current = targetId;
      setTabStopId(targetId);
      controlElementsRef.current.get(targetId)?.focus();
    },
    [enabledIds],
  );

  return { handleBlur, handleFocus, handleKeyDown, registerControl, tabStopId };
}

function ToolbarControlButton({
  control,
  keyboard,
}: Readonly<{
  control: ResolvedToolbarControl;
  keyboard: ReturnType<typeof useToolbarFocus>;
}>) {
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const handleBlur = () => {
    setTooltipDismissed(false);
    keyboard.handleBlur();
  };
  const handleFocus = () => {
    setTooltipDismissed(false);
    keyboard.handleFocus(control.id);
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setTooltipDismissed(true);
      return;
    }
    keyboard.handleKeyDown(event);
  };
  return (
    <span
      className="setta-workspace__toolbar-item"
      data-tooltip-dismissed={tooltipDismissed ? "true" : undefined}
      onPointerEnter={() => setTooltipDismissed(false)}
      onPointerLeave={() => setTooltipDismissed(false)}
    >
      <button
        aria-controls={control.ariaControls}
        aria-label={control.label}
        aria-pressed={control.pressed}
        className="setta-workspace__toolbar-control"
        data-workspace-control-id={control.id}
        data-workspace-control-placement={control.placement}
        data-workspace-control-source={control.source}
        disabled={control.disabled}
        onBlur={handleBlur}
        onClick={(event) => control.onPress(event.currentTarget)}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        ref={(element) => keyboard.registerControl(control.id, element)}
        tabIndex={!control.disabled && keyboard.tabStopId === control.id ? 0 : -1}
        type="button"
      >
        <span aria-hidden="true" className="setta-workspace__toolbar-control-icon">
          {control.icon}
        </span>
      </button>
      <span aria-hidden="true" className="setta-workspace__toolbar-tooltip">
        {control.label}
      </span>
    </span>
  );
}

function toolbarGroups(
  controls: readonly ResolvedToolbarControl[],
): readonly ToolbarControlGroup[] {
  return toolbarPlacements
    .map((placement) => ({
      controls: controls.filter((control) => control.placement === placement),
      label: `${placement[0]?.toUpperCase() ?? ""}${placement.slice(1)} controls`,
      placement,
    }))
    .filter((group) => group.controls.length > 0);
}

function ToolbarViewportObserver({
  canonicalViewport,
  pendingViewportRef,
  proposalRevision,
}: Readonly<{
  canonicalViewport: WorkspaceViewport;
  pendingViewportRef: MutableRefObject<WorkspaceViewport | null>;
  proposalRevision: number;
}>) {
  const renderedViewport = useViewport();
  useEffect(() => {
    const pendingViewport = pendingViewportRef.current;
    if (!pendingViewport) {
      return;
    }
    if (
      workspaceViewportsMatch(pendingViewport, renderedViewport) ||
      !workspaceViewportsMatch(pendingViewport, canonicalViewport)
    ) {
      pendingViewportRef.current = null;
    }
  }, [canonicalViewport, pendingViewportRef, proposalRevision, renderedViewport]);
  return null;
}

export function WorkspaceToolbar<TSectionData = WorkspaceJsonValue>({
  ariaLabel,
  canonicalViewport,
  controller,
  creationControl,
  gestureOptions,
  getCanvasBounds,
  gridSnap,
  minimapId,
  minimapVisible,
  onGridSnapChange,
  onMinimapVisibilityChange,
  sectionIds,
  toolbarControls,
}: WorkspaceToolbarProps<TSectionData>) {
  const pendingViewportRef = useRef<WorkspaceViewport | null>(null);
  const [proposalRevision, setProposalRevision] = useState(0);
  const changeZoom = useCallback(
    (resolveZoom: (zoom: number) => number) => {
      const currentViewport = pendingViewportRef.current ?? canonicalViewport;
      const zoom = Math.min(
        gestureOptions.maxZoom,
        Math.max(gestureOptions.minZoom, resolveZoom(currentViewport.zoom)),
      );
      if (Math.abs(zoom - currentViewport.zoom) < 0.000_001) {
        return;
      }
      const bounds = getCanvasBounds();
      const nextViewport = centeredZoomViewport(currentViewport, zoom, bounds.width, bounds.height);
      controller.setViewport(nextViewport);
      pendingViewportRef.current = nextViewport;
      setProposalRevision((revision) => revision + 1);
    },
    [
      canonicalViewport,
      controller,
      gestureOptions.maxZoom,
      gestureOptions.minZoom,
      getCanvasBounds,
    ],
  );
  const zoom = canonicalViewport.zoom;
  const resetZoom = Math.min(gestureOptions.maxZoom, Math.max(gestureOptions.minZoom, 1));
  const zoomMatchesReset = Math.abs(zoom - resetZoom) < 0.000_001;
  const builtInControls = useMemo<readonly ResolvedToolbarControl[]>(
    () => [
      ...(creationControl
        ? [
            {
              ariaControls: creationControl.ariaControls,
              disabled: creationControl.disabled,
              icon: <AddSectionIcon />,
              id: "add-section",
              label: "Add section",
              onPress: creationControl.onPress,
              placement: "project" as const,
              source: "built-in" as const,
            },
          ]
        : []),
      {
        disabled: zoom >= gestureOptions.maxZoom,
        icon: <ZoomInIcon />,
        id: "zoom-in",
        label: "Zoom in",
        onPress: () => changeZoom((currentZoom) => currentZoom * TOOLBAR_ZOOM_FACTOR),
        placement: "viewport",
        source: "built-in",
      },
      {
        disabled: zoom <= gestureOptions.minZoom,
        icon: <ZoomOutIcon />,
        id: "zoom-out",
        label: "Zoom out",
        onPress: () => changeZoom((currentZoom) => currentZoom / TOOLBAR_ZOOM_FACTOR),
        placement: "viewport",
        source: "built-in",
      },
      {
        disabled: zoomMatchesReset,
        icon: <ResetZoomIcon />,
        id: "reset-zoom",
        label: "Reset zoom",
        onPress: () => changeZoom(() => resetZoom),
        placement: "viewport",
        source: "built-in",
      },
      {
        disabled: sectionIds.length === 0,
        icon: <FitSectionsIcon />,
        id: "fit-sections",
        label: "Fit sections",
        onPress: () => void controller.fitSections(sectionIds),
        placement: "viewport",
        source: "built-in",
      },
      {
        disabled: false,
        icon: <SnapGridIcon />,
        id: "snap-to-grid",
        label: "Snap to grid",
        onPress: () => onGridSnapChange(!gridSnap),
        placement: "viewport",
        pressed: gridSnap,
        source: "built-in",
      },
      {
        ariaControls: minimapId,
        disabled: false,
        icon: <MinimapIcon />,
        id: "show-minimap",
        label: "Show minimap",
        onPress: () => onMinimapVisibilityChange(!minimapVisible),
        placement: "utility",
        pressed: minimapVisible,
        source: "built-in",
      },
    ],
    [
      controller,
      changeZoom,
      creationControl,
      gestureOptions.maxZoom,
      gestureOptions.minZoom,
      gridSnap,
      minimapId,
      minimapVisible,
      onGridSnapChange,
      onMinimapVisibilityChange,
      resetZoom,
      sectionIds,
      zoom,
      zoomMatchesReset,
    ],
  );
  const hostControls = useMemo<readonly ResolvedToolbarControl[]>(
    () =>
      toolbarControls.map((control) => ({
        disabled: control.disabled ?? false,
        icon: control.icon,
        id: control.id,
        label: control.label,
        onPress: () => control.onPress(controller),
        placement: control.placement,
        ...(control.pressed === undefined ? {} : { pressed: control.pressed }),
        source: "host" as const,
      })),
    [controller, toolbarControls],
  );
  const orderedControls = useMemo(
    () => [
      ...builtInControls.filter((control) => control.placement === "project"),
      ...hostControls.filter((control) => control.placement === "project"),
      ...builtInControls.filter((control) => control.placement === "viewport"),
      ...hostControls.filter((control) => control.placement === "viewport"),
      ...hostControls.filter((control) => control.placement === "utility"),
      ...builtInControls.filter((control) => control.placement === "utility"),
    ],
    [builtInControls, hostControls],
  );
  const keyboard = useToolbarFocus(orderedControls);
  const groups = toolbarGroups(orderedControls);

  return (
    <div
      aria-label={`${ariaLabel} controls`}
      aria-orientation="vertical"
      className={`setta-workspace__toolbar ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
      role="toolbar"
    >
      <ToolbarViewportObserver
        canonicalViewport={canonicalViewport}
        pendingViewportRef={pendingViewportRef}
        proposalRevision={proposalRevision}
      />
      {groups.map((group) => (
        <div
          aria-label={group.label}
          className="setta-workspace__toolbar-group"
          data-workspace-control-group={group.placement}
          key={group.placement}
          role="group"
        >
          {group.controls.map((control) => (
            <ToolbarControlButton control={control} keyboard={keyboard} key={control.id} />
          ))}
        </div>
      ))}
    </div>
  );
}
