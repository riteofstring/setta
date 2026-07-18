import type { Artifact } from "@generated/backend";
import { MarkdownText } from "../../components/markdown-text";

export interface EasyButtonMilestone {
  at: string;
  id: string;
  text: string;
  turnStartedAt: string | null;
}

const maxRenderedArtifacts = 6;
const maxRenderedMilestones = 5;

export function HighlightRail({
  milestones,
  speakingMilestoneId = null,
}: {
  milestones: readonly EasyButtonMilestone[];
  speakingMilestoneId?: string | null;
}) {
  const visibleMilestones = milestones.slice(-maxRenderedMilestones);
  return (
    <aside
      aria-label="Milestones"
      className="easy-button-rail easy-button-rail-left"
      data-easy-button-rail-empty={milestones.length === 0 ? "true" : "false"}
      data-easy-button-highlight-window-size={visibleMilestones.length}
    >
      <p className="easy-button-rail-label">Now</p>
      <ol className="easy-button-highlight-list" data-testid="easy-button-highlights">
        {visibleMilestones.map((milestone, index) => (
          <MilestoneItem
            key={milestone.id}
            age={visibleMilestones.length - index - 1}
            milestone={milestone}
            speaking={milestone.id === speakingMilestoneId}
          />
        ))}
      </ol>
    </aside>
  );
}

function MilestoneItem({
  age,
  milestone,
  speaking,
}: {
  age: number;
  milestone: EasyButtonMilestone;
  speaking: boolean;
}) {
  return (
    <li
      aria-current={speaking ? "true" : undefined}
      className="easy-button-highlight-item"
      data-easy-button-highlight-age={age}
      data-easy-button-highlight-id={milestone.id}
      data-easy-button-highlight-speaking={speaking ? "true" : undefined}
    >
      <span aria-hidden="true" className="easy-button-highlight-dot" />
      <span className="easy-button-highlight-text">{milestone.text}</span>
      <span className="easy-button-highlight-time">
        {milestoneElapsedLabel(milestone.turnStartedAt, milestone.at)}
      </span>
    </li>
  );
}

export function ArtifactRail({ artifacts }: { artifacts: readonly Artifact[] }) {
  const visibleArtifacts = artifacts.slice(-maxRenderedArtifacts);
  return (
    <aside
      aria-label="Artifacts"
      className="easy-button-rail easy-button-rail-right"
      data-easy-button-rail-empty={artifacts.length === 0 ? "true" : "false"}
    >
      <p className="easy-button-rail-label">Artifacts</p>
      <div className="easy-button-artifact-stack" data-testid="easy-button-artifacts">
        {visibleArtifacts.map((artifact) => (
          <ArtifactCard artifact={artifact} key={artifact.id} />
        ))}
      </div>
    </aside>
  );
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  return (
    <article
      className="easy-button-artifact-card"
      data-artifact-id={artifact.id}
      data-artifact-kind={artifact.kind}
    >
      <p className="easy-button-artifact-kicker">{artifactKindLabel(artifact.kind)}</p>
      {artifact.title ? <h2 className="easy-button-artifact-title">{artifact.title}</h2> : null}
      <ArtifactPayload artifact={artifact} />
    </article>
  );
}

function ArtifactPayload({ artifact }: { artifact: Artifact }) {
  switch (artifact.kind) {
    case "markdown":
      return <MarkdownArtifact artifact={artifact} />;
    case "table":
      return <TableArtifact artifact={artifact} />;
    case "bar_chart":
      return <BarChartArtifact artifact={artifact} />;
    case "file":
      return <FileArtifact artifact={artifact} />;
  }
  const _exhaustive: never = artifact.kind;
  return _exhaustive;
}

function MarkdownArtifact({ artifact }: { artifact: Artifact }) {
  const payload = requireArtifactPayload(artifact.markdown, artifact.kind);
  return (
    <div className="easy-button-artifact-markdown">
      <MarkdownText text={payload.markdown} />
    </div>
  );
}

function TableArtifact({ artifact }: { artifact: Artifact }) {
  const payload = requireArtifactPayload(artifact.table, artifact.kind);
  return (
    <div className="easy-button-artifact-table-wrap">
      <table className="easy-button-artifact-table">
        <thead>
          <tr>
            {payload.columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payload.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {payload.columns.map((column, columnIndex) => (
                <td key={column.key}>{row[columnIndex] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarChartArtifact({ artifact }: { artifact: Artifact }) {
  const payload = requireArtifactPayload(artifact.barChart, artifact.kind);
  const maxValue = Math.max(...payload.items.map((item) => item.value), 0);
  return (
    <div className="easy-button-artifact-bars">
      {payload.items.map((item) => (
        <div className="easy-button-artifact-bar-row" key={item.label}>
          <span className="easy-button-artifact-bar-label">{item.label}</span>
          <div className="easy-button-artifact-bar-track">
            <span
              aria-label={`${item.label}: ${formatArtifactValue(item.value, item.unit)}`}
              className="easy-button-artifact-bar"
              style={{ width: `${maxValue > 0 ? Math.max((item.value / maxValue) * 100, 2) : 0}%` }}
            />
            <span className="easy-button-artifact-bar-value">
              {formatArtifactValue(item.value, item.unit)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function FileArtifact({ artifact }: { artifact: Artifact }) {
  const payload = requireArtifactPayload(artifact.file, artifact.kind);
  return (
    <div className="easy-button-artifact-file">
      <code>{payload.path}</code>
      {payload.description ? <p>{payload.description}</p> : null}
    </div>
  );
}

function requireArtifactPayload<Payload>(
  payload: Payload | null | undefined,
  kind: Artifact["kind"],
): Payload {
  if (!payload) {
    throw new Error(`Artifact ${kind} is missing its typed payload`);
  }
  return payload;
}

function formatArtifactValue(value: number, unit: string | null): string {
  const formatted = Number.isInteger(value)
    ? String(value)
    : value.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      });
  return unit ? `${formatted} ${unit}` : formatted;
}

function artifactKindLabel(kind: Artifact["kind"]): string {
  switch (kind) {
    case "markdown":
      return "Markdown";
    case "table":
      return "Table";
    case "bar_chart":
      return "Bar chart";
    case "file":
      return "File";
  }
}

export function milestoneElapsedLabel(startedAt: string | null, at: string): string {
  if (!startedAt) {
    return "";
  }
  const startMs = Date.parse(startedAt);
  const atMs = Date.parse(at);
  if (!Number.isFinite(startMs) || !Number.isFinite(atMs) || atMs < startMs) {
    return "";
  }
  const totalSeconds = Math.round((atMs - startMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
