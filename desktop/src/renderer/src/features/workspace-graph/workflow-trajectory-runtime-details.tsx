import type { WorkflowNodeDetailsTarget } from "../../stores/workflow-editor-store";
import {
  trajectorySpriteFullDetailLabel,
  trajectorySpriteKindLabel,
  trajectorySpritePrimaryLabel,
  trajectorySpriteSecondaryLabel,
  trajectorySpriteStatusLabel,
} from "./workspace-trajectory-display-labels";
import { WorkflowDetailsRows, WorkflowDetailsSection } from "./workflow-node-details-components";
import { shortIdentifier } from "./workflow-node-details-helpers";

type WorkflowTrajectoryDisplayItem = NonNullable<
  WorkflowNodeDetailsTarget["trajectory"]
>["items"][number];
type WorkflowTrajectorySpriteDisplay = Extract<WorkflowTrajectoryDisplayItem, { type: "sprite" }>;
type WorkflowTrajectoryAggregateDisplay = Extract<
  WorkflowTrajectoryDisplayItem,
  { type: "aggregate" }
>;

export function WorkflowTrajectoryRuntimeDetails({
  target,
}: {
  target: WorkflowNodeDetailsTarget;
}) {
  const trajectory = target.trajectory ?? null;
  if (trajectory === null || trajectory.totalCount <= 0) {
    return null;
  }
  return (
    <div className="border-b border-zinc-800 px-4 py-3">
      <WorkflowDetailsSection title="Trajectory">
        <WorkflowDetailsRows
          rows={[
            { label: "Activity", value: trajectory.totalCount },
            {
              hidden: trajectory.hiddenCount <= 0,
              label: "Hidden groups",
              value: trajectory.hiddenCount,
            },
          ]}
        />
        <WorkflowTrajectoryItemList items={trajectory.items} />
      </WorkflowDetailsSection>
    </div>
  );
}

function WorkflowTrajectoryItemList({
  items,
}: {
  items: NonNullable<WorkflowNodeDetailsTarget["trajectory"]>["items"];
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      {items.map((display) => (
        <WorkflowTrajectoryItemDetails display={display} key={display.id} />
      ))}
    </div>
  );
}

function WorkflowTrajectoryItemDetails({ display }: { display: WorkflowTrajectoryDisplayItem }) {
  if (display.type === "aggregate") {
    return <WorkflowTrajectoryAggregateDetails display={display} />;
  }
  return <WorkflowTrajectorySpriteDetails display={display} />;
}

function WorkflowTrajectorySpriteDetails({
  display,
}: {
  display: WorkflowTrajectorySpriteDisplay;
}) {
  const { sprite } = display;
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-300">
      {sprite.kind === "command" ? (
        <WorkflowTrajectoryCommandSummary sprite={sprite} />
      ) : (
        <WorkflowTrajectoryDefaultSummary sprite={sprite} />
      )}
      <WorkflowDetailsRows
        rows={[
          {
            hidden: sprite.runItemId === "",
            label: "Run item",
            value: shortIdentifier(sprite.runItemId),
          },
          {
            hidden: sprite.chatRunId === "",
            label: "Chat run",
            value: shortIdentifier(sprite.chatRunId),
          },
          {
            hidden: sprite.providerItemId === "",
            label: "Provider",
            value: shortIdentifier(sprite.providerItemId),
          },
        ]}
      />
      <WorkflowTrajectoryFileRefs files={sprite.fileRefs} />
      <WorkflowTrajectorySourceRefs sourceRefs={sprite.sourceRefs} />
    </div>
  );
}

function WorkflowTrajectoryAggregateDetails({
  display,
}: {
  display: WorkflowTrajectoryAggregateDisplay;
}) {
  const { aggregate } = display;
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-300">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate font-medium text-zinc-200">{aggregate.label}</span>
        <span className="shrink-0 text-zinc-500">
          {trajectorySpriteStatusLabel(aggregate.status)}
        </span>
      </div>
      <WorkflowDetailsRows
        rows={[
          { label: "Represented", value: sourceRecordCountLabel(aggregate.count) },
          {
            hidden: aggregate.hiddenSourcePreviewCount <= 0,
            label: "More sources",
            value: aggregate.hiddenSourcePreviewCount,
          },
        ]}
      />
      <WorkflowTrajectoryAggregateSourcePreviews display={display} />
      {aggregate.kind === "memory_suggestion" ? null : (
        <div className="mt-1 flex flex-wrap gap-1" aria-label="Source ids">
          {aggregate.sourceSpriteIds.slice(0, 6).map((id) => (
            <span
              className="rounded-sm border border-zinc-800 bg-zinc-900/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
              key={id}
            >
              {shortIdentifier(id)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkflowTrajectoryAggregateSourcePreviews({
  display,
}: {
  display: WorkflowTrajectoryAggregateDisplay;
}) {
  const { aggregate } = display;
  if (aggregate.sourcePreviews.length === 0) {
    return null;
  }
  return (
    <div className="mt-1 space-y-1">
      {aggregate.sourcePreviews.map((preview) => (
        <div
          className="rounded-sm border border-zinc-800 bg-zinc-900/50 px-2 py-1"
          key={preview.id}
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate text-zinc-200">{preview.label}</span>
            <span className="shrink-0 text-zinc-500">
              {trajectorySpriteStatusLabel(preview.status)}
            </span>
          </div>
          {preview.summary !== "" ? (
            <div className="mt-0.5 whitespace-pre-wrap break-words text-zinc-400">
              {preview.summary}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function WorkflowTrajectoryCommandSummary({
  sprite,
}: {
  sprite: WorkflowTrajectorySpriteDisplay["sprite"];
}) {
  const primary = trajectorySpritePrimaryLabel(sprite);
  const secondary = trajectorySpriteSecondaryLabel(sprite);
  const fullDetail = trajectorySpriteFullDetailLabel(sprite);
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate font-medium text-zinc-200">{primary}</span>
        <span className="shrink-0 text-zinc-500">{trajectorySpriteStatusLabel(sprite.status)}</span>
      </div>
      {secondary !== "" ? <div className="mt-0.5 truncate text-zinc-500">{secondary}</div> : null}
      {fullDetail !== "" ? (
        <pre className="mt-1 overflow-auto whitespace-pre-wrap rounded-sm bg-zinc-900/70 px-2 py-1 font-mono text-[10px] leading-4 text-zinc-300">
          {fullDetail}
        </pre>
      ) : null}
      <WorkflowDetailsRows
        rows={[
          { hidden: sprite.command.cwd === "", label: "Cwd", value: sprite.command.cwd },
          {
            hidden: sprite.command.exitCode === 0 && sprite.status !== "failed",
            label: "Exit code",
            value: sprite.command.exitCode,
          },
          {
            hidden: sprite.command.durationMs <= 0,
            label: "Duration",
            value: `${sprite.command.durationMs} ms`,
          },
        ]}
      />
    </>
  );
}

function WorkflowTrajectoryDefaultSummary({
  sprite,
}: {
  sprite: WorkflowTrajectorySpriteDisplay["sprite"];
}) {
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate font-medium text-zinc-200">
          {trajectorySpriteKindLabel(sprite.kind)}
        </span>
        <span className="shrink-0 text-zinc-500">{trajectorySpriteStatusLabel(sprite.status)}</span>
      </div>
      <div className="mt-1 truncate text-zinc-300">{sprite.title}</div>
      {sprite.subtitle !== "" ? (
        <div className="mt-0.5 truncate text-zinc-500">{sprite.subtitle}</div>
      ) : null}
    </>
  );
}

function WorkflowTrajectoryFileRefs({
  files,
}: {
  files: WorkflowTrajectorySpriteDisplay["sprite"]["fileRefs"];
}) {
  if (files.length === 0) {
    return null;
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {files.map((file) => (
        <span
          className="rounded-sm border border-zinc-800 bg-zinc-900/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300"
          key={[file.operation, file.path, file.rangeStart, file.rangeEnd].join(":")}
        >
          {trajectoryFileRefLabel(file)}
        </span>
      ))}
    </div>
  );
}

function WorkflowTrajectorySourceRefs({
  sourceRefs,
}: {
  sourceRefs: WorkflowTrajectorySpriteDisplay["sprite"]["sourceRefs"];
}) {
  if (sourceRefs.length === 0) {
    return null;
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {sourceRefs.map((ref) => (
        <span
          className="rounded-sm border border-zinc-800 bg-zinc-900/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
          key={`${ref.kind}:${ref.id}`}
        >
          {ref.kind}:{shortIdentifier(ref.id)}
        </span>
      ))}
    </div>
  );
}

function sourceRecordCountLabel(count: number) {
  return count === 1 ? "1 source record" : `${count} source records`;
}

function trajectoryFileRefLabel(
  file: WorkflowTrajectorySpriteDisplay["sprite"]["fileRefs"][number],
) {
  const path = file.displayPath || file.path;
  const range =
    file.rangeStart > 0 && file.rangeEnd > 0 ? `:${file.rangeStart}-${file.rangeEnd}` : "";
  const diff =
    file.additions > 0 || file.deletions > 0 ? ` +${file.additions} -${file.deletions}` : "";
  return `${file.operation} ${path}${range}${diff}`;
}
