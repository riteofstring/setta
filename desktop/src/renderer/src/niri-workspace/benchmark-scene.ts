import type { NiriColumn, NiriPane, NiriWorkspaceScene, SurfaceKind } from "./types";

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
    id: "phase-4-browser-pane-benchmark",
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
  const surfaceKind = fakeSurfaceKind(sequence);
  return {
    columnId,
    heat: (sequence * 37) % 100,
    paneId: `niri_pane_${sequence}`,
    sequence,
    subtitle: `${surfaceKindLabel(surfaceKind)} ${kind} surface`,
    surfaceId: `niri_surface_${sequence}`,
    surfaceKind,
    title: `Pane ${String(sequence + 1).padStart(3, "0")}`,
    tone,
    weight: 1 + ((sequence + rowIndex) % 3) * 0.12,
  };
}

function fakeSurfaceKind(sequence: number): SurfaceKind {
  switch (sequence) {
    case 1:
      return "fake-long-chat";
    case 2:
      return "settings-dom";
    case 3:
      return "chat-dom";
    default:
      break;
  }

  if (sequence >= 8 && (sequence - 8) % 5 === 0) {
    return "browser";
  }

  const slot = sequence % 12;
  if (slot === 4) {
    return "fake-canvas";
  }
  if (slot >= 5 && slot <= 7) {
    return "fake-heavy-dom";
  }
  return "fake-dom";
}

function surfaceKindLabel(kind: SurfaceKind): string {
  switch (kind) {
    case "chat-dom":
      return "real chat";
    case "fake-canvas":
      return "fake canvas";
    case "fake-dom":
      return "fake light";
    case "fake-heavy-dom":
      return "fake heavy";
    case "fake-long-chat":
      return "fake long chat";
    case "settings-dom":
      return "real settings";
    case "snapshot":
      return "snapshot";
    case "browser":
      return "browser";
    default:
      assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled fake surface kind: ${String(value)}`);
}
