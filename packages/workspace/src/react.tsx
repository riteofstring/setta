import {
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import {
  createEmptyWorkspaceDocument,
  resolveWorkspaceCapabilities,
  resolveWorkspaceGestureOptions,
  validateWorkspaceDocument,
  type WorkspaceAppearance,
  type WorkspaceAppearanceOptionOverrides,
  type WorkspaceCapabilityOverrides,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspaceDocumentChange,
  type WorkspaceGestureOptionOverrides,
  type WorkspaceGestureOptions,
  type WorkspaceGridOptionOverrides,
  type WorkspaceJsonValue,
} from "./core.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
  WorkspaceCanvasAdapter,
} from "./internal/workspace-canvas-adapter.js";
import type { WorkspaceCanvasController } from "./internal/workspace-canvas-navigation.js";
import { createWorkspaceController } from "./internal/workspace-controller.js";
import {
  resolveWorkspaceAppearanceOptions,
  resolveWorkspaceGridOptions,
  type ResolvedWorkspaceAppearanceOptions,
} from "./internal/workspace-preferences.js";

export type WorkspaceDocumentChangeHandler<TSectionData = WorkspaceJsonValue> = (
  document: WorkspaceDocument<TSectionData>,
  change: WorkspaceDocumentChange,
) => void;

type SharedWorkspaceProps<TSectionData> = Omit<
  HTMLAttributes<HTMLElement>,
  "aria-label" | "children"
> & {
  ariaLabel?: string;
  appearanceOptions?: WorkspaceAppearanceOptionOverrides;
  capabilities?: WorkspaceCapabilityOverrides;
  children?: ReactNode;
  controllerRef?: Ref<WorkspaceController<TSectionData>>;
  emptyState?: ReactNode;
  gestureOptions?: WorkspaceGestureOptionOverrides;
  gridOptions?: WorkspaceGridOptionOverrides;
  readOnly?: boolean;
};

type ControlledWorkspaceProps<TSectionData> = {
  defaultDocument?: never;
  document: WorkspaceDocument<TSectionData>;
  onDocumentChange: WorkspaceDocumentChangeHandler<TSectionData>;
};

type UncontrolledWorkspaceProps<TSectionData> = {
  defaultDocument?: WorkspaceDocument<TSectionData>;
  document?: never;
  onDocumentChange?: WorkspaceDocumentChangeHandler<TSectionData>;
};

export type WorkspaceProps<TSectionData = WorkspaceJsonValue> = SharedWorkspaceProps<TSectionData> &
  (ControlledWorkspaceProps<TSectionData> | UncontrolledWorkspaceProps<TSectionData>);

type WorkspaceMode<TSectionData> =
  | Readonly<{ document: WorkspaceDocument<TSectionData>; type: "controlled" }>
  | Readonly<{ document: WorkspaceDocument<TSectionData>; type: "uncontrolled" }>;

function resolveMode<TSectionData>(
  document: WorkspaceDocument<TSectionData> | undefined,
  defaultDocument: WorkspaceDocument<TSectionData> | undefined,
  initialZoom: number,
  onDocumentChange: WorkspaceDocumentChangeHandler<TSectionData> | undefined,
): WorkspaceMode<TSectionData> {
  if (document && defaultDocument) {
    throw new TypeError("Workspace cannot receive both document and defaultDocument.");
  }
  if (document) {
    if (typeof onDocumentChange !== "function") {
      throw new TypeError("A controlled Workspace requires onDocumentChange.");
    }
    return { document, type: "controlled" };
  }
  const emptyDocument = createEmptyWorkspaceDocument();
  return {
    document:
      defaultDocument ??
      ({
        ...emptyDocument,
        viewport: { ...emptyDocument.viewport, zoom: initialZoom },
      } as WorkspaceDocument<TSectionData>),
    type: "uncontrolled",
  };
}

function assertStableMode(initialMode: WorkspaceMode<unknown>["type"], currentMode: string): void {
  if (initialMode !== currentMode) {
    throw new TypeError("Workspace cannot switch between controlled and uncontrolled usage.");
  }
}

function assertViewportWithinGestureBounds(
  document: WorkspaceDocument<unknown>,
  gestureOptions: WorkspaceGestureOptions,
): void {
  const { zoom } = document.viewport;
  if (zoom < gestureOptions.minZoom || zoom > gestureOptions.maxZoom) {
    throw new TypeError(
      "Workspace document viewport zoom must be within the configured gesture zoom bounds.",
    );
  }
}

const DARK_APPEARANCE_QUERY = "(prefers-color-scheme: dark)";
type ResolvedWorkspaceAppearance = Exclude<WorkspaceAppearance, "system">;
const lightAppearanceSnapshot = (): ResolvedWorkspaceAppearance => "light";
const emptyAppearanceSubscription = () => () => undefined;

function currentSystemAppearance(): ResolvedWorkspaceAppearance {
  return window.matchMedia(DARK_APPEARANCE_QUERY).matches ? "dark" : "light";
}

function subscribeToSystemAppearance(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_APPEARANCE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function useResolvedWorkspaceAppearance(
  appearance: WorkspaceAppearance,
): ResolvedWorkspaceAppearance {
  const followsSystem = appearance === "system";
  const systemAppearance = useSyncExternalStore(
    followsSystem ? subscribeToSystemAppearance : emptyAppearanceSubscription,
    followsSystem ? currentSystemAppearance : lightAppearanceSnapshot,
    lightAppearanceSnapshot,
  );
  return appearance === "system" ? systemAppearance : appearance;
}

function workspaceThemeStyle(
  options: ResolvedWorkspaceAppearanceOptions,
  appearance: ResolvedWorkspaceAppearance,
): CSSProperties {
  const tokens = options[appearance];
  return {
    "--setta-workspace-canvas-background": tokens.canvasBackground,
    "--setta-workspace-focus": tokens.focus,
    "--setta-workspace-grid-color": tokens.gridColor,
    "--setta-workspace-invalid": tokens.invalid,
    "--setta-workspace-minimap-background": tokens.minimapBackground,
    "--setta-workspace-section-background": tokens.sectionBackground,
    "--setta-workspace-section-muted-text": tokens.sectionMutedText,
    "--setta-workspace-section-text": tokens.sectionText,
    "--setta-workspace-selection": tokens.selection,
    "--setta-workspace-toolbar-background": tokens.toolbarBackground,
    colorScheme: appearance,
  } as CSSProperties;
}

export type WorkspaceInteractionBoundaryProps = HTMLAttributes<HTMLDivElement> &
  Readonly<{
    preventPan?: boolean;
    preventWheel?: boolean;
  }>;

export function WorkspaceInteractionBoundary({
  className,
  preventPan = true,
  preventWheel = true,
  ...props
}: WorkspaceInteractionBoundaryProps) {
  if (typeof preventPan !== "boolean" || typeof preventWheel !== "boolean") {
    throw new TypeError("Workspace interaction boundary options must be boolean.");
  }
  const resolvedClassName = [
    "setta-workspace__interaction-boundary",
    preventPan ? WORKSPACE_NO_PAN_CLASS_NAME : null,
    preventWheel ? WORKSPACE_NO_WHEEL_CLASS_NAME : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      {...props}
      className={resolvedClassName}
      data-workspace-prevent-pan={preventPan ? "true" : undefined}
      data-workspace-prevent-wheel={preventWheel ? "true" : undefined}
    />
  );
}

export function Workspace<TSectionData = WorkspaceJsonValue>(props: WorkspaceProps<TSectionData>) {
  const {
    ariaLabel = "Workspace",
    appearanceOptions: appearanceOptionOverrides,
    capabilities: capabilityOverrides,
    children,
    className,
    controllerRef,
    defaultDocument,
    document: controlledDocument,
    emptyState = "No sections yet.",
    gestureOptions: gestureOptionOverrides,
    gridOptions: gridOptionOverrides,
    onDocumentChange,
    readOnly = false,
    style,
    ...sectionProps
  } = props;
  const gestureOptions = useMemo(
    () => resolveWorkspaceGestureOptions(gestureOptionOverrides),
    [gestureOptionOverrides],
  );
  const appearanceOptions = useMemo(
    () => resolveWorkspaceAppearanceOptions(appearanceOptionOverrides),
    [appearanceOptionOverrides],
  );
  const gridOptions = useMemo(
    () => resolveWorkspaceGridOptions(gridOptionOverrides),
    [gridOptionOverrides],
  );
  const resolvedAppearance = useResolvedWorkspaceAppearance(appearanceOptions.appearance);
  const themeStyle = useMemo(
    () => workspaceThemeStyle(appearanceOptions, resolvedAppearance),
    [appearanceOptions, resolvedAppearance],
  );
  const mode = resolveMode(
    controlledDocument,
    defaultDocument,
    gestureOptions.initialZoom,
    onDocumentChange,
  );
  const initialModeRef = useRef(mode.type);
  assertStableMode(initialModeRef.current, mode.type);
  const [uncontrolledDocument, setUncontrolledDocument] = useState(mode.document);
  const document = mode.type === "controlled" ? mode.document : uncontrolledDocument;
  const validatedDocument = useMemo(() => {
    validateWorkspaceDocument(document);
    assertViewportWithinGestureBounds(document, gestureOptions);
    return document;
  }, [document, gestureOptions]);
  const capabilities = useMemo(
    () => resolveWorkspaceCapabilities(capabilityOverrides, readOnly),
    [capabilityOverrides, readOnly],
  );
  const documentRef = useRef(validatedDocument);
  const capabilitiesRef = useRef(capabilities);
  const controlledRef = useRef(mode.type === "controlled");
  const onDocumentChangeRef = useRef(onDocumentChange);
  documentRef.current = validatedDocument;
  capabilitiesRef.current = capabilities;
  controlledRef.current = mode.type === "controlled";
  onDocumentChangeRef.current = onDocumentChange;

  const canvasControllerRef = useRef<WorkspaceCanvasController | null>(null);
  const handleCanvasControllerChange = useCallback((next: WorkspaceCanvasController | null) => {
    canvasControllerRef.current = next;
  }, []);
  const internalControllerRef = useRef<WorkspaceController<TSectionData> | null>(null);
  if (!internalControllerRef.current) {
    internalControllerRef.current = createWorkspaceController({
      commit: (nextDocument, change) => {
        if (!controlledRef.current) {
          documentRef.current = nextDocument;
          setUncontrolledDocument(nextDocument);
        }
        onDocumentChangeRef.current?.(nextDocument, change);
      },
      getCapabilities: () => capabilitiesRef.current,
      getCanvasController: () => canvasControllerRef.current,
      getDocument: () => documentRef.current,
    });
  }
  const controller = internalControllerRef.current;
  useImperativeHandle(controllerRef, () => controller, [controller]);

  const resolvedClassName = ["setta-workspace", className].filter(Boolean).join(" ");
  const hasNoSections = validatedDocument.rootSections.length === 0;
  const resolvedEmptyState = hasNoSections ? emptyState : null;

  return (
    <section
      {...sectionProps}
      aria-label={ariaLabel}
      className={resolvedClassName}
      data-read-only={readOnly ? "true" : "false"}
      data-setta-workspace=""
      data-workspace-appearance={appearanceOptions.appearance}
      data-workspace-mode={mode.type}
      data-workspace-resolved-appearance={resolvedAppearance}
      style={{ ...style, ...themeStyle }}
    >
      <WorkspaceCanvasAdapter
        ariaLabel={ariaLabel}
        document={validatedDocument}
        emptyState={resolvedEmptyState}
        gestureOptions={gestureOptions}
        gridOptions={gridOptions}
        onCanvasControllerChange={handleCanvasControllerChange}
        onViewportCommit={controller.setViewport}
        overlay={children}
      />
    </section>
  );
}
