import type { RunActivityPage, RunItem, RunItemOutput } from "@generated/backend";
import { ExternalLink, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AgentRunActivityRows } from "../../components/agent-run-activity";
import { Button } from "../../components/ui/button";
import type { WorkflowGraphActivitySpriteTarget } from "./pixi-renderer";
import { recordWorkflowGraphActivitySpriteDetailsOpen } from "./workflow-graph-recording";
import { runActivityPageOutputState } from "./workflow-node-details-components";

const popoverWidthPx = 360;
const popoverMinMarginPx = 12;
const runActivityLimit = 100;

interface ActivitySpritePopoverState {
  error: string;
  item: RunItem | null;
  loading: boolean;
  output: RunItemOutput[];
}

const emptyPopoverState: ActivitySpritePopoverState = {
  error: "",
  item: null,
  loading: false,
  output: [],
};

export function WorkflowActivitySpritePopover({
  onDismiss,
  onOpenDetails,
  surfaceId,
  target,
}: {
  onDismiss: () => void;
  onOpenDetails: (target: WorkflowGraphActivitySpriteTarget) => void;
  surfaceId: string;
  target: WorkflowGraphActivitySpriteTarget | null;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ActivitySpritePopoverState>(emptyPopoverState);
  const position = useMemo(() => popoverPosition(target), [target]);

  useEffect(() => {
    if (target === null) {
      setState(emptyPopoverState);
      return;
    }
    let disposed = false;
    setState({ ...emptyPopoverState, loading: true });
    void loadActivityItem(target)
      .then((nextState) => {
        if (!disposed) {
          setState(nextState);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setState({
            ...emptyPopoverState,
            error: errorMessage(error),
          });
        }
      });
    return () => {
      disposed = true;
    };
  }, [target]);

  useEffect(() => {
    if (target === null) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const popover = popoverRef.current;
      if (popover !== null && event.target instanceof Node && popover.contains(event.target)) {
        return;
      }
      onDismiss();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onDismiss, target]);

  if (target === null) {
    return null;
  }

  const outputState = runActivityPageOutputState(state.output);
  const openDetails = () => {
    recordWorkflowGraphActivitySpriteDetailsOpen({ surfaceId, target });
    onOpenDetails(target);
  };

  return (
    <div
      className="fixed z-30 max-h-[min(28rem,calc(100vh-1.5rem))] w-[min(22.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-md border border-cyan-500/30 bg-zinc-950/95 text-zinc-100 shadow-xl shadow-zinc-950/50 backdrop-blur"
      data-run-item-id={target.runItemId}
      data-sprite-id={target.spriteId}
      data-testid="workflow-activity-sprite-popover"
      ref={popoverRef}
      style={{ left: position.left, top: position.top }}
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-zinc-100">{target.kind}</div>
          <div className="truncate font-mono text-[11px] text-zinc-500">{target.runItemId}</div>
        </div>
        <button
          aria-label="Close activity"
          className="rounded-sm p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          onClick={onDismiss}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[20rem] overflow-auto px-3 pb-3">
        <ActivitySpritePopoverBody
          error={state.error}
          item={state.item}
          loading={state.loading}
          outputIdsByRunItemId={outputState.outputIdsByRunItemId}
          outputsById={outputState.outputsById}
        />
      </div>
      <div className="flex justify-end border-t border-zinc-800 px-3 py-2">
        <Button
          className="h-8 gap-1.5 border-cyan-500/30 bg-zinc-900 text-xs text-zinc-100 hover:bg-zinc-800"
          onClick={openDetails}
          type="button"
          variant="secondary"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open full node details
        </Button>
      </div>
    </div>
  );
}

export function ActivitySpritePopoverBody({
  error,
  item,
  loading,
  outputIdsByRunItemId,
  outputsById,
}: {
  error: string;
  item: RunItem | null;
  loading: boolean;
  outputIdsByRunItemId: Record<string, string[]>;
  outputsById: Record<string, RunItemOutput>;
}) {
  if (loading) {
    return <div className="py-3 text-xs text-zinc-500">Loading activity</div>;
  }
  if (error !== "") {
    return <div className="py-3 text-xs text-rose-300">{error}</div>;
  }
  if (item === null) {
    return <div className="py-3 text-xs text-zinc-500">Activity item not found.</div>;
  }
  return (
    <AgentRunActivityRows
      highlightedRunItemId={item.id}
      items={[item]}
      outputIdsByRunItemId={outputIdsByRunItemId}
      outputPagesByRunItemId={{}}
      outputsById={outputsById}
    />
  );
}

async function loadActivityItem(
  target: WorkflowGraphActivitySpriteTarget,
): Promise<ActivitySpritePopoverState> {
  const page: RunActivityPage = await window.setta.chat.runActivity(
    target.workspaceId,
    target.chatRunId,
    runActivityLimit,
  );
  const item = page.items.find((candidate) => candidate.id === target.runItemId) ?? null;
  return {
    error: "",
    item,
    loading: false,
    output: page.output.filter((candidate) => candidate.runItemId === target.runItemId),
  };
}

function popoverPosition(target: WorkflowGraphActivitySpriteTarget | null) {
  if (target === null || typeof window === "undefined") {
    return { left: popoverMinMarginPx, top: popoverMinMarginPx };
  }
  const maxLeft = Math.max(
    popoverMinMarginPx,
    window.innerWidth - popoverWidthPx - popoverMinMarginPx,
  );
  const maxTop = Math.max(popoverMinMarginPx, window.innerHeight - 320);
  return {
    left: clamp(target.clientX, popoverMinMarginPx, maxLeft),
    top: clamp(target.clientY, popoverMinMarginPx, maxTop),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
