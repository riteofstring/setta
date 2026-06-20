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

type WorkflowTrajectorySpriteDisplay = NonNullable<
  WorkflowNodeDetailsTarget["trajectory"]
>["sprites"][number];

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
            { label: "Recent", value: trajectory.totalCount },
            {
              hidden: trajectory.hiddenCount <= 0,
              label: "Hidden",
              value: trajectory.hiddenCount,
            },
            { label: "Revision", value: trajectory.revision },
          ]}
        />
        <WorkflowTrajectorySpriteList sprites={trajectory.sprites} />
      </WorkflowDetailsSection>
    </div>
  );
}

function WorkflowTrajectorySpriteList({
  sprites,
}: {
  sprites: NonNullable<WorkflowNodeDetailsTarget["trajectory"]>["sprites"];
}) {
  if (sprites.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      {sprites.map((display) => (
        <WorkflowTrajectorySpriteDetails display={display} key={display.sprite.id} />
      ))}
    </div>
  );
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
  files: NonNullable<
    WorkflowNodeDetailsTarget["trajectory"]
  >["sprites"][number]["sprite"]["fileRefs"];
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
  sourceRefs: NonNullable<
    WorkflowNodeDetailsTarget["trajectory"]
  >["sprites"][number]["sprite"]["sourceRefs"];
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

function trajectoryFileRefLabel(
  file: NonNullable<
    WorkflowNodeDetailsTarget["trajectory"]
  >["sprites"][number]["sprite"]["fileRefs"][number],
) {
  const path = file.displayPath || file.path;
  const range =
    file.rangeStart > 0 && file.rangeEnd > 0 ? `:${file.rangeStart}-${file.rangeEnd}` : "";
  const diff =
    file.additions > 0 || file.deletions > 0 ? ` +${file.additions} -${file.deletions}` : "";
  return `${file.operation} ${path}${range}${diff}`;
}
