import type { NiriColumn, NiriPane, NiriWorkspaceScene } from "./types";

export const phaseOneFakePaneCount = 500;
export const phaseOneVisiblePaneCount = 40;

const defaultPanesPerColumn = 5;
const toneSequence = ["cyan", "green", "orange", "pink", "slate"] as const;
const workKinds = ["notes", "diff", "trace", "task", "search"] as const;

export interface BenchmarkSceneOptions {
  paneCount?: number;
  targetVisiblePanes?: number;
}

export function generateBenchmarkScene({
  paneCount = phaseOneFakePaneCount,
  targetVisiblePanes = phaseOneVisiblePaneCount,
}: BenchmarkSceneOptions = {}): NiriWorkspaceScene {
  const panesPerColumn = defaultPanesPerColumn;
  const visibleColumnCount = Math.ceil(targetVisiblePanes / panesPerColumn);
  const columnCount = Math.ceil(paneCount / panesPerColumn);
  const columns: NiriColumn[] = [];
  const panes: NiriPane[] = [];
  const paneById = new Map<string, NiriPane>();

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const columnId = `niri_column_${columnIndex}`;
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
      index: columnIndex,
      paneIds,
      widthWeight: 1,
    });
  }

  return {
    columnGap: 8,
    columns,
    id: "phase-1-fake-pane-benchmark",
    paneById,
    panes,
    panesPerColumn,
    padding: 10,
    rowGap: 8,
    targetVisiblePanes,
    totalPanes: panes.length,
    visibleColumnCount,
  };
}

function createFakePane(columnId: string, sequence: number, rowIndex: number): NiriPane {
  const kind = workKinds[sequence % workKinds.length] ?? "notes";
  const tone = toneSequence[(sequence + rowIndex) % toneSequence.length] ?? "slate";
  return {
    columnId,
    heat: (sequence * 37) % 100,
    paneId: `niri_pane_${sequence}`,
    sequence,
    subtitle: `fake ${kind} surface`,
    surfaceId: `niri_surface_${sequence}`,
    surfaceKind: "fake-dom",
    title: `Pane ${String(sequence + 1).padStart(3, "0")}`,
    tone,
    weight: 1 + ((sequence + rowIndex) % 3) * 0.12,
  };
}
