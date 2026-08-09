import {
  WORKSPACE_DOCUMENT_SCHEMA_VERSION,
  type WorkspaceChildLayout,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspaceRootSection,
  type WorkspaceSection,
  type WorkspaceViewport,
} from "@setta/workspace/core";
import { Workspace, type SectionDefinition } from "@setta/workspace/react";
import { useRef, useState } from "react";

type ProfileSectionData = string | null;

/**
 * Deterministic large-document culling fixture. The grid leaves one column
 * (the pan alley) completely vacant so a synthetic pan gesture can press an
 * empty canvas point at any row, and reserves two named cells next to the
 * alley: a leaf the profiler focuses before panning it offscreen (selected
 * pinning) and a leaf it drags (active pinning).
 */
const CULLING_PROFILE_GRID = Object.freeze({
  alleyColumn: 7,
  cellHeight: 150,
  cellWidth: 260,
  columnCount: 14,
  columnSpacing: 360,
  dragCell: Object.freeze({ column: 8, row: 3 }),
  originX: 24,
  originY: 24,
  pinnedCell: Object.freeze({ column: 6, row: 3 }),
  rowCount: 10,
  rowSpacing: 560,
});

const PROFILE_SECTION_DEFINITIONS: readonly SectionDefinition<ProfileSectionData>[] = [
  {
    defaultSize: { height: 150, width: 260 },
    displayName: "Profile note",
    kind: "profile-note",
    render: ({ data }) => <p className="culling-profile-note">{data ?? "Culling profile note."}</p>,
  },
  {
    canContainSections: true,
    defaultChildOrientation: "vertical",
    defaultChildOverflow: "grow",
    defaultSize: { height: 200, width: 300 },
    defaultSizeMode: { height: "content", width: "fixed" },
    displayName: "Profile group",
    kind: "profile-group",
    render: () => null,
  },
];

function profileNote(
  id: string,
  title: string,
  body: string,
  width: number,
  height: number,
): WorkspaceSection<ProfileSectionData> {
  return {
    childLayout: null,
    data: body,
    id,
    isMinimized: false,
    kind: "profile-note",
    positionAndSizeLocked: false,
    presentation: { accentColor: null, chrome: "default", tagColor: null },
    size: {
      height: { mode: "fixed", value: height },
      width: { mode: "fixed", value: width },
    },
    title,
  };
}

function profileGroup(
  id: string,
  title: string,
  childLayout: WorkspaceChildLayout,
  width: number,
  fixedHeight: number | null = null,
): WorkspaceSection<ProfileSectionData> {
  return {
    childLayout,
    data: null,
    id,
    isMinimized: false,
    kind: "profile-group",
    positionAndSizeLocked: false,
    presentation: { accentColor: null, chrome: "default", tagColor: null },
    size: {
      height:
        fixedHeight === null
          ? { mode: "content", value: 200 }
          : { mode: "fixed", value: fixedHeight },
      width: { mode: "fixed", value: width },
    },
    title,
  };
}

function addLeafCell(
  sections: Record<string, WorkspaceSection<ProfileSectionData>>,
  cellId: string,
  label: string,
): void {
  sections[cellId] = profileNote(
    cellId,
    label,
    `Leaf host content for ${label}.`,
    CULLING_PROFILE_GRID.cellWidth,
    CULLING_PROFILE_GRID.cellHeight,
  );
}

function addGroupCell(
  sections: Record<string, WorkspaceSection<ProfileSectionData>>,
  cellId: string,
  label: string,
): void {
  const leafA = `${cellId}-leaf-a`;
  const leafB = `${cellId}-leaf-b`;
  const subgroup = `${cellId}-row`;
  const subLeafA = `${cellId}-row-leaf-a`;
  const subLeafB = `${cellId}-row-leaf-b`;
  sections[leafA] = profileNote(leafA, `${label} leaf A`, "First ordered child.", 240, 90);
  sections[leafB] = profileNote(leafB, `${label} leaf B`, "Second ordered child.", 240, 90);
  sections[subLeafA] = profileNote(subLeafA, `${label} row leaf A`, "Deep child.", 110, 90);
  sections[subLeafB] = profileNote(subLeafB, `${label} row leaf B`, "Deep child.", 110, 90);
  sections[subgroup] = profileGroup(
    subgroup,
    `${label} row`,
    {
      orientation: "horizontal",
      overflow: "grow",
      positioning: "ordered",
      sectionIds: [subLeafA, subLeafB],
    },
    260,
  );
  sections[cellId] = profileGroup(
    cellId,
    label,
    {
      orientation: "vertical",
      overflow: "grow",
      positioning: "ordered",
      sectionIds: [leafA, leafB, subgroup],
    },
    300,
  );
}

function addFreeformCell(
  sections: Record<string, WorkspaceSection<ProfileSectionData>>,
  cellId: string,
  label: string,
): void {
  const noteA = `${cellId}-free-a`;
  const noteB = `${cellId}-free-b`;
  sections[noteA] = profileNote(noteA, `${label} free A`, "Freeform child.", 130, 100);
  sections[noteB] = profileNote(noteB, `${label} free B`, "Freeform child.", 130, 100);
  sections[cellId] = profileGroup(
    cellId,
    label,
    {
      overflow: "grow",
      positioning: "freeform",
      positions: {
        [noteA]: { x: 16, y: 16 },
        [noteB]: { x: 150, y: 200 },
      },
      sectionIds: [noteA, noteB],
    },
    300,
    360,
  );
}

function cellKind(column: number, row: number): "drag" | "freeform" | "group" | "leaf" | "vacant" {
  const grid = CULLING_PROFILE_GRID;
  if (column === grid.alleyColumn) {
    return "vacant";
  }
  if (column === grid.pinnedCell.column && row === grid.pinnedCell.row) {
    return "leaf";
  }
  if (column === grid.dragCell.column && row === grid.dragCell.row) {
    return "drag";
  }
  const index = row * grid.columnCount + column;
  if (index % 5 === 0) {
    return "group";
  }
  return index % 5 === 3 ? "freeform" : "leaf";
}

function addCell(
  sections: Record<string, WorkspaceSection<ProfileSectionData>>,
  rootSections: WorkspaceRootSection[],
  column: number,
  row: number,
): void {
  const kind = cellKind(column, row);
  if (kind === "vacant") {
    return;
  }
  const grid = CULLING_PROFILE_GRID;
  const cellId = `cell-r${String(row)}-c${String(column)}`;
  rootSections.push({
    position: {
      x: grid.originX + column * grid.columnSpacing,
      y: grid.originY + row * grid.rowSpacing,
    },
    sectionId: cellId,
  });
  if (kind === "group") {
    addGroupCell(sections, cellId, `Group r${String(row)} c${String(column)}`);
  } else if (kind === "freeform") {
    addFreeformCell(sections, cellId, `Freeform r${String(row)} c${String(column)}`);
  } else if (kind === "drag") {
    addLeafCell(sections, cellId, "Drag target");
  } else if (column === grid.pinnedCell.column && row === grid.pinnedCell.row) {
    addLeafCell(sections, cellId, "Pinned target");
  } else {
    addLeafCell(sections, cellId, `Note r${String(row)} c${String(column)}`);
  }
}

function createCullingProfileDocument(
  viewport: WorkspaceViewport,
): WorkspaceDocument<ProfileSectionData> {
  const rootSections: WorkspaceRootSection[] = [];
  const sections: Record<string, WorkspaceSection<ProfileSectionData>> = {};
  for (let row = 0; row < CULLING_PROFILE_GRID.rowCount; row += 1) {
    for (let column = 0; column < CULLING_PROFILE_GRID.columnCount; column += 1) {
      addCell(sections, rootSections, column, row);
    }
  }
  return {
    rootSections,
    schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
    sections,
    viewport,
  };
}

function profileViewportNumber(search: URLSearchParams, name: string, fallback: number): number {
  const raw = search.get(name);
  if (raw === null) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new TypeError(
      `The culling profile ${name} query must be a finite number, not ${JSON.stringify(raw)}.`,
    );
  }
  return value;
}

function profileViewport(search: URLSearchParams): WorkspaceViewport {
  return {
    x: profileViewportNumber(search, "viewport-x", 24),
    y: profileViewportNumber(search, "viewport-y", 8),
    zoom: profileViewportNumber(search, "zoom", 1),
  };
}

export function CullingProfilePage() {
  const search = new URLSearchParams(window.location.search);
  const controllerRef = useRef<WorkspaceController<ProfileSectionData>>(null);
  const [document, setDocument] = useState(() =>
    createCullingProfileDocument(profileViewport(search)),
  );
  const [status, setStatus] = useState("Culling profile ready.");

  return (
    <>
      <a className="skip-link" href="#culling-profile-content">
        Skip to culling profile
      </a>
      <header className="site-header site-header--compact">
        <p className="eyebrow" translate="no">
          Setta UI phase 4
        </p>
        <h1>Workspace culling profile</h1>
        <p className="lede">
          A deterministic large document rendered only through the public package API with viewport
          culling enabled, for pan, zoom, pinning, and drag frame-pacing profiles. The zoom,
          viewport-x, and viewport-y queries set the initial viewport for repeatable runs.
        </p>
      </header>
      <main id="culling-profile-content" tabIndex={-1}>
        <fieldset className="canvas-shell-settings">
          <legend>Profile controls</legend>
          <button
            type="button"
            onClick={() => {
              const controller = controllerRef.current;
              if (!controller) {
                throw new Error("The culling profile controller is not mounted.");
              }
              controller.clearSelection();
              setDocument(createCullingProfileDocument(profileViewport(search)));
              setStatus("Reset the culling profile document.");
            }}
          >
            Reset culling document
          </button>
        </fieldset>
        <p className="announcement" role="status" aria-live="polite">
          {status}
        </p>
        <p className="canvas-shell-settings-hint">
          Document sections:{" "}
          <span data-testid="culling-profile-section-count">
            {String(Object.keys(document.sections).length)}
          </span>
        </p>
        <div className="workspace-host">
          <Workspace
            appearanceOptions={{ appearance: "light" }}
            ariaLabel="Culling profile workspace"
            controllerRef={controllerRef}
            document={document}
            gestureOptions={{
              maxZoom: 2,
              minZoom: 0.25,
              panOnDrag: true,
              panOnScroll: true,
              panOnScrollMode: "free",
              panOnScrollSpeed: 0.5,
              zoomActivationKey: "Alt",
              zoomOnDoubleClick: false,
              zoomOnPinch: true,
              zoomOnScroll: false,
            }}
            minimapOptions={{ placement: "right", visible: true }}
            onDocumentChange={(nextDocument, change) => {
              setDocument(nextDocument);
              setStatus(`Document change: ${change.reason}.`);
            }}
            sectionDefinitions={PROFILE_SECTION_DEFINITIONS}
            viewportCullingOptions={{ enabled: true }}
          />
        </div>
      </main>
    </>
  );
}
