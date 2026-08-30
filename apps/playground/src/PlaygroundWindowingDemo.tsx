import {
  createWorkspaceWindowSpace,
  createWorkspaceWindowingState,
  createWorkspaceWindowViewport,
  openWorkspaceFloatingWindow,
  reopenWorkspaceWindow,
  snapshotWorkspaceWindowSpace,
  WorkspaceShell,
  WorkspaceWindowSpacesPane,
  WorkspaceWindowingError,
  type OpenWorkspaceFloatingWindowInput,
  type WorkspaceFloatingWindow,
  type WorkspaceItemDiagnosticRegistry,
  type WorkspaceSectionTagColorPalette,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellTabIconProps,
  type WorkspaceShellViewState,
  type WorkspaceWindowBoundaryInsets,
  type WorkspaceWindowRenderers,
  type WorkspaceWindowSpace,
  type WorkspaceWindowingState,
  type WorkspaceWindowViewport,
} from "@setta/workspace";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { PlaygroundItemDiagnosticsProvider } from "./sectionKinds";
import { PlaygroundWindowInteractionDiagnostics } from "./PlaygroundWindowInteractionDiagnostics";

type PlaygroundWindowingDemoProps = {
  readonly baseTrailingTabs: ReadonlyArray<WorkspaceShellTabDefinition>;
  readonly itemDiagnostics: WorkspaceItemDiagnosticRegistry;
  readonly leadingPaneShiftsCanvas: boolean;
  readonly leadingTabs: ReadonlyArray<WorkspaceShellTabDefinition>;
  readonly onShellViewStateChange: (nextState: WorkspaceShellViewState) => void;
  readonly sectionTagColorPalette: WorkspaceSectionTagColorPalette;
  readonly shellViewState: WorkspaceShellViewState;
};

const PLAYGROUND_WINDOW_VIEWPORT_FALLBACK = Object.freeze({
  height: 720,
  width: 1_200,
});
const PLAYGROUND_CLOSED_PANE_WIDTH = 40;

const PLAYGROUND_DEMO_WINDOWS = [
  {
    bounds: { height: 300, width: 420, x: 72, y: 64 },
    contentId: "playground-reference-note",
    id: "playground-reference-note-window",
    rendererData: {
      body: "This is ordinary host-owned data. The package only selects this renderer and manages its frame.",
      heading: "Reference note",
    },
    surfaceKind: "playground-note",
    title: "Reference note",
  },
  {
    bounds: { height: 320, width: 400, x: 536, y: 150 },
    contentId: "playground-checklist",
    id: "playground-checklist-window",
    rendererData: {
      heading: "Reusable checklist",
      items: [
        "Open and focus arbitrary surfaces",
        "Snap or resize the layout",
        "Save the visible floating layout",
      ],
    },
    surfaceKind: "playground-checklist",
    title: "Reusable checklist",
  },
] as const satisfies readonly OpenWorkspaceFloatingWindowInput[];

function WindowSpacesIcon({
  className,
  ...iconProps
}: WorkspaceShellTabIconProps) {
  return (
    <svg
      {...iconProps}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
    >
      <rect height="4.5" rx="0.75" width="5.5" x="2" y="2" />
      <rect height="4.5" rx="0.75" width="5.5" x="8.5" y="2" />
      <rect height="4.5" rx="0.75" width="5.5" x="2" y="9.5" />
      <rect height="4.5" rx="0.75" width="5.5" x="8.5" y="9.5" />
    </svg>
  );
}

function isPlaygroundWindowDataRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getPlaygroundWindowText(
  value: WorkspaceFloatingWindow["rendererData"],
  key: string,
  fallback: string,
): string {
  if (!isPlaygroundWindowDataRecord(value)) {
    return fallback;
  }
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : fallback;
}

function getPlaygroundWindowTextList(
  value: WorkspaceFloatingWindow["rendererData"],
  key: string,
): readonly string[] {
  if (!isPlaygroundWindowDataRecord(value)) {
    return [];
  }
  const candidate = value[key];
  return Array.isArray(candidate)
    ? candidate.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function PlaygroundNoteWindow({ window }: { window: WorkspaceFloatingWindow }) {
  return (
    <div className="playground-floating-window-content">
      <span className="playground-floating-window-eyebrow">
        Generic renderer
      </span>
      <h2>
        {getPlaygroundWindowText(
          window.rendererData,
          "heading",
          "Untitled note",
        )}
      </h2>
      <p>
        {getPlaygroundWindowText(
          window.rendererData,
          "body",
          "This renderer receives host-owned JSON data.",
        )}
      </p>
      <span className="playground-floating-window-identity">
        Content: {window.contentId}
      </span>
    </div>
  );
}

function PlaygroundChecklistWindow({
  window,
}: {
  window: WorkspaceFloatingWindow;
}) {
  const items = getPlaygroundWindowTextList(window.rendererData, "items");
  return (
    <div className="playground-floating-window-content">
      <span className="playground-floating-window-eyebrow">
        Generic renderer
      </span>
      <h2>
        {getPlaygroundWindowText(window.rendererData, "heading", "Checklist")}
      </h2>
      <ul className="playground-floating-window-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <span className="playground-floating-window-identity">
        Content: {window.contentId}
      </span>
    </div>
  );
}

const playgroundWindowRenderers = {
  "playground-checklist": (window) => (
    <PlaygroundChecklistWindow window={window} />
  ),
  "playground-note": (window) => <PlaygroundNoteWindow window={window} />,
} satisfies WorkspaceWindowRenderers;

function createPlaygroundWindowingState(): WorkspaceWindowingState {
  return createWorkspaceWindowingState({ windows: PLAYGROUND_DEMO_WINDOWS });
}

function createPlaygroundWindowBoundaryInsets(
  shellViewState: WorkspaceShellViewState,
): WorkspaceWindowBoundaryInsets {
  return {
    bottom: 0,
    left: shellViewState.leading.visible
      ? shellViewState.leading.width
      : PLAYGROUND_CLOSED_PANE_WIDTH,
    right: shellViewState.trailing.visible
      ? shellViewState.trailing.width
      : PLAYGROUND_CLOSED_PANE_WIDTH,
    top: 0,
  };
}

function usePlaygroundWindowViewport(insets: WorkspaceWindowBoundaryInsets): {
  readonly ref: RefObject<HTMLDivElement | null>;
  readonly viewport: WorkspaceWindowViewport;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ height: number; width: number }>(
    PLAYGROUND_WINDOW_VIEWPORT_FALLBACK,
  );

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const measure = (width: number, height: number) => {
      if (width <= 0 || height <= 0) {
        return;
      }
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { height, width },
      );
    };
    const initialBounds = element.getBoundingClientRect();
    measure(initialBounds.width, initialBounds.height);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === element) {
          measure(entry.contentRect.width, entry.contentRect.height);
        }
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const viewport = useMemo(
    () =>
      createWorkspaceWindowViewport({
        ...size,
        insets,
      }),
    [insets, size],
  );
  return { ref, viewport };
}

function openOrReopenPlaygroundWindow(
  state: WorkspaceWindowingState,
  window: OpenWorkspaceFloatingWindowInput,
  viewport: WorkspaceWindowViewport,
): WorkspaceWindowingState {
  const existing = state.windows.find(
    (candidate) => candidate.contentId === window.contentId,
  );
  return existing
    ? reopenWorkspaceWindow(state, existing.id)
    : openWorkspaceFloatingWindow(state, window, viewport);
}

function renamePlaygroundWindowSpace(
  spaces: readonly WorkspaceWindowSpace[],
  spaceId: string,
  nextName: string,
): readonly WorkspaceWindowSpace[] {
  return spaces.map((space) =>
    space.id === spaceId
      ? createWorkspaceWindowSpace({ ...space, name: nextName })
      : space,
  );
}

function deletePlaygroundWindowSpace(
  spaces: readonly WorkspaceWindowSpace[],
  spaceId: string,
): readonly WorkspaceWindowSpace[] {
  return spaces
    .filter((space) => space.id !== spaceId)
    .map((space, order) => createWorkspaceWindowSpace({ ...space, order }));
}

export function PlaygroundWindowingDemo({
  baseTrailingTabs,
  itemDiagnostics,
  leadingPaneShiftsCanvas,
  leadingTabs,
  onShellViewStateChange,
  sectionTagColorPalette,
  shellViewState,
}: PlaygroundWindowingDemoProps) {
  const windowBoundaryInsets = useMemo(
    () => createPlaygroundWindowBoundaryInsets(shellViewState),
    [shellViewState],
  );
  const { ref: workspaceRef, viewport: windowViewport } =
    usePlaygroundWindowViewport(windowBoundaryInsets);
  const [windowingState, setWindowingState] = useState(
    createPlaygroundWindowingState,
  );
  const [windowSpaces, setWindowSpaces] = useState<
    readonly WorkspaceWindowSpace[]
  >([]);
  const [nextWindowSpaceNumber, setNextWindowSpaceNumber] = useState(1);
  const [windowSpaceSaveError, setWindowSpaceSaveError] = useState<
    string | null
  >(null);

  const openDemoWindow = (window: OpenWorkspaceFloatingWindowInput) => {
    setWindowingState((current) =>
      openOrReopenPlaygroundWindow(current, window, windowViewport),
    );
  };

  const saveWindowSpace = () => {
    const number = nextWindowSpaceNumber;
    try {
      const space = snapshotWorkspaceWindowSpace(
        windowingState,
        {
          id: `playground-window-space-${number}`,
          name: `Window Space ${number}`,
          order: windowSpaces.length,
        },
        windowViewport,
      );
      setWindowSpaces((current) => [...current, space]);
      setNextWindowSpaceNumber(number + 1);
      setWindowSpaceSaveError(null);
    } catch (error) {
      if (error instanceof WorkspaceWindowingError) {
        setWindowSpaceSaveError(error.message);
        return;
      }
      throw error;
    }
  };

  const trailingTabs: ReadonlyArray<WorkspaceShellTabDefinition> = [
    ...baseTrailingTabs,
    {
      id: "host-window-spaces",
      label: "Window Spaces",
      icon: WindowSpacesIcon,
      renderContent: () => (
        <div className="playground-host-pane playground-window-spaces-host-pane">
          <p>
            This backend-free host keeps its window state and saved layouts in
            local React state.
          </p>
          <button
            className="playground-pane-action"
            onClick={() => openDemoWindow(PLAYGROUND_DEMO_WINDOWS[0])}
            type="button"
          >
            Open or reopen reference note
          </button>
          <PlaygroundWindowInteractionDiagnostics rootRef={workspaceRef} />
          <WorkspaceWindowSpacesPane
            errors={
              windowSpaceSaveError ? { save: windowSpaceSaveError } : undefined
            }
            onDelete={(spaceId) =>
              setWindowSpaces((current) =>
                deletePlaygroundWindowSpace(current, spaceId),
              )
            }
            onRename={(spaceId, nextName) =>
              setWindowSpaces((current) =>
                renamePlaygroundWindowSpace(current, spaceId, nextName),
              )
            }
            onSave={saveWindowSpace}
            onStateChange={(nextState) => setWindowingState(nextState)}
            spaces={windowSpaces}
            state={windowingState}
            viewport={windowViewport}
          />
        </div>
      ),
    },
  ];

  return (
    <div ref={workspaceRef} className="playground-workspace">
      <PlaygroundItemDiagnosticsProvider diagnostics={itemDiagnostics}>
        <WorkspaceShell
          ariaLabel="Playground workspace"
          includeBuiltInSavedViews={true}
          includeSavedViewTabs={true}
          leadingPaneShiftsCanvas={leadingPaneShiftsCanvas}
          leadingTabs={leadingTabs}
          navigator={{}}
          onViewStateChange={onShellViewStateChange}
          sectionTagColorPalette={sectionTagColorPalette}
          trailingTabs={trailingTabs}
          viewState={shellViewState}
          windowing={{
            ariaLabel: "Playground windows",
            onStateChange: setWindowingState,
            renderers: playgroundWindowRenderers,
            state: windowingState,
            viewport: windowViewport,
          }}
        />
      </PlaygroundItemDiagnosticsProvider>
    </div>
  );
}
