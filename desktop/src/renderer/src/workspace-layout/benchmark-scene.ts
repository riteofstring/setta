import type {
  WorkspaceColumn,
  WorkspacePane,
  WorkspaceScene,
  NonEasyButtonSurfaceKind,
  SurfaceKind,
} from "./types";

export const phaseOneFakePaneCount = 500;
export const phaseOneVisiblePaneCount = 40;

const defaultPanesPerColumn = 5;
const toneSequence = ["cyan", "green", "orange", "pink", "slate"] as const;
const workKinds = ["notes", "diff", "trace", "task", "search"] as const;
const seededSurfaceKinds = new Map<number, NonEasyButtonSurfaceKind>([
  [1, "fake-heavy-dom"],
  [2, "fake-dom"],
  [3, "fake-dom"],
]);
const surfaceKindLabels = {
  browser: "browser",
  "easy-button": "easy button",
  "empty-frame": "empty frame",
  "fake-dom": "fake light",
  "fake-heavy-dom": "fake heavy",
  snapshot: "snapshot",
} satisfies Record<SurfaceKind, string>;

export interface BenchmarkSceneOptions {
  paneCount?: number;
  targetVisiblePanes?: number;
}

export function generateBenchmarkScene({
  paneCount = phaseOneFakePaneCount,
  targetVisiblePanes = phaseOneVisiblePaneCount,
}: BenchmarkSceneOptions = {}): WorkspaceScene {
  const panesPerColumn = defaultPanesPerColumn;
  const visibleColumnCount = Math.ceil(targetVisiblePanes / panesPerColumn);
  const columnCount = Math.ceil(paneCount / panesPerColumn);
  const columns: WorkspaceColumn[] = [];
  const panes: WorkspacePane[] = [];
  const paneById = new Map<string, WorkspacePane>();

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const columnId = `workspace_column_${columnIndex}`;
    const paneIds: string[] = [];

    for (let rowIndex = 0; rowIndex < panesPerColumn; rowIndex += 1) {
      const sequence = columnIndex * panesPerColumn + rowIndex;
      if (sequence >= paneCount) {
        break;
      }
      const pane = createFakePane(columnId, sequence, rowIndex);
      panes.push(pane);
      paneById.set(pane.paneId, pane);
      paneIds.push(pane.paneId);
    }

    columns.push({
      columnId,
      idealWidthSpec: { unit: "proportion", value: 1 / visibleColumnCount },
      index: columnIndex,
      paneIds,
      planeIndex: 0,
      slotIndex: columnIndex,
      widthSpec: { unit: "proportion", value: 1 / visibleColumnCount },
    });
  }

  return {
    columnGap: 8,
    columns,
    defaultColumnWidthSpec: { unit: "proportion", value: 1 / visibleColumnCount },
    id: "workspace-dom-browser-benchmark",
    paneById,
    panes,
    panesPerColumn,
    padding: 10,
    renderOverscanColumns: 0,
    rowGap: 8,
    targetVisiblePanes,
    totalPanes: panes.length,
    visibleColumnCount,
  };
}

function createFakePane(columnId: string, sequence: number, rowIndex: number): WorkspacePane {
  const kind = workKinds[sequence % workKinds.length] ?? "notes";
  const tone = toneSequence[(sequence + rowIndex) % toneSequence.length] ?? "slate";
  const surfaceKind = fakeSurfaceKind(sequence);
  return {
    columnId,
    heat: (sequence * 37) % 100,
    paneId: `workspace_pane_${sequence}`,
    sequence,
    subtitle: `${surfaceKindLabel(surfaceKind)} ${kind} surface`,
    surfaceId: `workspace_surface_${sequence}`,
    surfaceKind,
    title: `Pane ${String(sequence + 1).padStart(3, "0")}`,
    tone,
    weight: 1 + ((sequence + rowIndex) % 3) * 0.12,
  };
}

function fakeSurfaceKind(sequence: number): NonEasyButtonSurfaceKind {
  const seededKind = seededSurfaceKinds.get(sequence);
  if (seededKind) {
    return seededKind;
  }
  if (isBrowserPaneSequence(sequence)) {
    return "browser";
  }
  const slot = sequence % 12;
  if (slot >= 4 && slot <= 7) {
    return "fake-heavy-dom";
  }
  return "fake-dom";
}

function isBrowserPaneSequence(sequence: number): boolean {
  return sequence >= 8 && (sequence - 8) % 8 === 0;
}

function surfaceKindLabel(kind: SurfaceKind): string {
  return surfaceKindLabels[kind];
}
