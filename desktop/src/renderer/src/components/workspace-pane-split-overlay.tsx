import { cn } from "../lib/utils";
import type { WorkspacePaneSplitTarget, WorkspacePaneTabDragPayload } from "./workspace-pane";

type SplitColumn = "center" | "left" | "right";
type SplitRow = "bottom" | "center" | "top";

const splitTargetByCell = {
  "bottom:center": "bottom",
  "bottom:left": "bottom-left",
  "bottom:right": "bottom-right",
  "center:center": null,
  "center:left": "left",
  "center:right": "right",
  "top:center": "top",
  "top:left": "top-left",
  "top:right": "top-right",
} satisfies Record<`${SplitRow}:${SplitColumn}`, WorkspacePaneSplitTarget | null>;

const workspacePaneSplitTargets = [
  { cellClass: "col-start-1 row-start-1", label: "Top left", target: "top-left" },
  { cellClass: "col-start-2 row-start-1", label: "Top", target: "top" },
  { cellClass: "col-start-3 row-start-1", label: "Top right", target: "top-right" },
  { cellClass: "col-start-1 row-start-2", label: "Left", target: "left" },
  { cellClass: "col-start-3 row-start-2", label: "Right", target: "right" },
  { cellClass: "col-start-1 row-start-3", label: "Bottom left", target: "bottom-left" },
  { cellClass: "col-start-2 row-start-3", label: "Bottom", target: "bottom" },
  { cellClass: "col-start-3 row-start-3", label: "Bottom right", target: "bottom-right" },
] satisfies {
  cellClass: string;
  label: string;
  target: WorkspacePaneSplitTarget;
}[];

export function WorkspacePaneSplitDropOverlay({
  activeTarget,
  canSplit,
  draggingTab,
  onDropTarget,
}: {
  activeTarget: WorkspacePaneSplitTarget | null;
  canSplit: boolean;
  draggingTab: WorkspacePaneTabDragPayload | null;
  onDropTarget: (payload: WorkspacePaneTabDragPayload, target: WorkspacePaneSplitTarget) => void;
}) {
  if (!draggingTab) {
    return null;
  }
  if (!canSplit) {
    return (
      <div className="pointer-events-none absolute inset-0 z-[70] grid place-items-center bg-zinc-950/35">
        <div className="rounded-sm border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-300 shadow-xl shadow-black/35">
          Four pane limit reached
        </div>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-[70] grid grid-cols-3 grid-rows-3 gap-1 bg-zinc-950/20 p-2">
      <div className="col-start-2 row-start-2 grid place-items-center">
        <div className="rounded-sm border border-zinc-700/80 bg-zinc-950/90 px-2 py-1 text-[11px] font-medium text-zinc-400 shadow-lg shadow-black/30">
          Split tab
        </div>
      </div>
      {workspacePaneSplitTargets.map((target) => (
        <WorkspacePaneSplitDropTarget
          active={activeTarget === target.target}
          draggingTab={draggingTab}
          key={target.target}
          label={target.label}
          onDropTarget={onDropTarget}
          target={target.target}
          targetClass={target.cellClass}
        />
      ))}
    </div>
  );
}

function WorkspacePaneSplitDropTarget({
  active,
  draggingTab,
  label,
  onDropTarget,
  target,
  targetClass,
}: {
  active: boolean;
  draggingTab: WorkspacePaneTabDragPayload;
  label: string;
  onDropTarget: (payload: WorkspacePaneTabDragPayload, target: WorkspacePaneSplitTarget) => void;
  target: WorkspacePaneSplitTarget;
  targetClass: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto grid place-items-center rounded-sm border bg-zinc-900/65 text-[11px] font-semibold text-zinc-300 shadow-inner shadow-black/35 transition-colors",
        active
          ? "border-zinc-200 bg-zinc-700/90 text-zinc-50 shadow-lg shadow-zinc-950/50"
          : "border-zinc-600/70 hover:border-zinc-400 hover:bg-zinc-800/85 hover:text-zinc-50",
        targetClass,
      )}
      data-active-target={active ? "true" : "false"}
      data-testid={`workspace-split-target-${target}`}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropTarget(draggingTab, target);
      }}
    >
      {label}
    </div>
  );
}

export function workspacePaneSplitTargetFromPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): WorkspacePaneSplitTarget | null {
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  const column = splitColumn(x);
  const row = splitRow(y);
  if (!column || !row) {
    return null;
  }
  return splitTargetByCell[`${row}:${column}`];
}

function splitColumn(value: number): SplitColumn | null {
  if (value < 0 || value > 1) {
    return null;
  }
  if (value < 1 / 3) {
    return "left";
  }
  if (value > 2 / 3) {
    return "right";
  }
  return "center";
}

function splitRow(value: number): SplitRow | null {
  if (value < 0 || value > 1) {
    return null;
  }
  if (value < 1 / 3) {
    return "top";
  }
  if (value > 2 / 3) {
    return "bottom";
  }
  return "center";
}
