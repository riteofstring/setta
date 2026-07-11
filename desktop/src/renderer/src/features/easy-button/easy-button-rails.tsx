import type { Artifact } from "@generated/backend";

export interface EasyButtonMilestone {
  at: string;
  id: string;
  text: string;
  turnStartedAt: string | null;
}

export function HighlightRail({ milestones }: { milestones: readonly EasyButtonMilestone[] }) {
  return (
    <aside
      aria-label="Milestones"
      className="easy-button-rail easy-button-rail-left"
      data-easy-button-rail-empty={milestones.length === 0 ? "true" : "false"}
    >
      <p className="easy-button-rail-label">Now</p>
      <ol className="easy-button-highlight-list" data-testid="easy-button-highlights">
        {milestones.map((milestone) => (
          <MilestoneItem key={milestone.id} milestone={milestone} />
        ))}
      </ol>
    </aside>
  );
}

function MilestoneItem({ milestone }: { milestone: EasyButtonMilestone }) {
  return (
    <li className="easy-button-highlight-item" data-easy-button-highlight-id={milestone.id}>
      <span aria-hidden="true" className="easy-button-highlight-dot" />
      <span className="easy-button-highlight-text">{milestone.text}</span>
      <span className="easy-button-highlight-time">
        {milestoneElapsedLabel(milestone.turnStartedAt, milestone.at)}
      </span>
    </li>
  );
}

export function ArtifactRail({ artifacts }: { artifacts: readonly Artifact[] }) {
  return (
    <aside
      aria-label="Artifacts"
      className="easy-button-rail easy-button-rail-right"
      data-easy-button-rail-empty={artifacts.length === 0 ? "true" : "false"}
    >
      <p className="easy-button-rail-label">Artifacts</p>
      <div className="easy-button-artifact-stack" data-testid="easy-button-artifacts">
        {artifacts.map((artifact) => (
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
      <div className="easy-button-artifact-file">
        <code>{artifact.uri}</code>
        {artifact.mediaType ? <p>{artifact.mediaType}</p> : null}
      </div>
    </article>
  );
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
    case "tool_output":
      return "Tool output";
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
