import type { CSSProperties } from "react";

import type { EasyArtifact, EasyHighlight, EasyRun } from "@generated/backend";

import { MarkdownText } from "../../components/markdown-text";
import type { SpeechPlaybackState } from "./speech-playback-controller";

export function HighlightRail({
  highlights,
  latestRun,
  playbackState,
  workspaceId,
}: {
  highlights: EasyHighlight[];
  latestRun: EasyRun | null;
  playbackState: SpeechPlaybackState;
  workspaceId: string | null;
}) {
  return (
    <aside
      aria-label="Highlights"
      className="easy-button-rail easy-button-rail-left"
      data-easy-button-rail-empty={highlights.length === 0 ? "true" : "false"}
    >
      <p className="easy-button-rail-label">Now</p>
      <ol className="easy-button-highlight-list" data-testid="easy-button-highlights">
        {highlights.map((highlight) => (
          <HighlightItem
            highlight={highlight}
            key={highlight.id}
            playbackState={playbackState}
            startedAt={latestRun?.startedAt ?? null}
            workspaceId={workspaceId}
          />
        ))}
      </ol>
    </aside>
  );
}

function HighlightItem({
  highlight,
  playbackState,
  startedAt,
  workspaceId,
}: {
  highlight: EasyHighlight;
  playbackState: SpeechPlaybackState;
  startedAt: string | null;
  workspaceId: string | null;
}) {
  const speaking = highlightIsSpeaking(playbackState, highlight, workspaceId);
  return (
    <li
      className="easy-button-highlight-item"
      data-easy-button-highlight-id={highlight.id}
      data-easy-button-highlight-speaking={speaking ? "true" : "false"}
    >
      <span aria-hidden="true" className="easy-button-highlight-dot">
        <i />
        <i />
        <i />
      </span>
      <span className="easy-button-highlight-text">{highlight.text}</span>
      <span className="easy-button-highlight-time">
        {highlightElapsedLabel(startedAt, highlight.at)}
      </span>
    </li>
  );
}

export function highlightIsSpeaking(
  state: SpeechPlaybackState,
  highlight: EasyHighlight,
  workspaceId: string | null,
): boolean {
  return (
    state.type === "speaking" &&
    state.source.kind === "highlight" &&
    state.source.workspaceId === workspaceId &&
    state.source.easyRunId === highlight.easyRunId &&
    state.source.highlightId === highlight.id
  );
}

export function ArtifactRail({ artifacts }: { artifacts: EasyArtifact[] }) {
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

function ArtifactCard({ artifact }: { artifact: EasyArtifact }) {
  return (
    <article className="easy-button-artifact-card" data-artifact-kind={artifact.kind}>
      {artifact.kicker ? <p className="easy-button-artifact-kicker">{artifact.kicker}</p> : null}
      <h2 className="easy-button-artifact-title">{artifact.title}</h2>
      <ArtifactPayload artifact={artifact} />
    </article>
  );
}

function ArtifactPayload({ artifact }: { artifact: EasyArtifact }) {
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

function MarkdownArtifact({ artifact }: { artifact: EasyArtifact }) {
  const payload = requireArtifactPayload(artifact.markdown, artifact.kind);
  return (
    <div className="easy-button-artifact-markdown">
      <MarkdownText text={payload.markdown} />
    </div>
  );
}

function TableArtifact({ artifact }: { artifact: EasyArtifact }) {
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

function BarChartArtifact({ artifact }: { artifact: EasyArtifact }) {
  const payload = requireArtifactPayload(artifact.barChart, artifact.kind);
  const maxValue = Math.max(...payload.items.map((item) => item.value), 0);
  return (
    <div className="easy-button-artifact-bars">
      {payload.items.map((item) => (
        <div className="easy-button-artifact-bar-row" key={item.label}>
          <div className="easy-button-artifact-bar-label">{item.label}</div>
          <div className="easy-button-artifact-bar-track">
            <div className="easy-button-artifact-bar" style={barWidthStyle(item.value, maxValue)} />
            <div className="easy-button-artifact-bar-value">
              {item.value}
              {item.unit ?? ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FileArtifact({ artifact }: { artifact: EasyArtifact }) {
  const payload = requireArtifactPayload(artifact.file, artifact.kind);
  return (
    <div className="easy-button-artifact-file">
      <code>{payload.path}</code>
      {payload.description ? <p>{payload.description}</p> : null}
    </div>
  );
}

function barWidthStyle(value: number, maxValue: number): CSSProperties {
  const ratio = maxValue > 0 ? Math.max(0, Math.min(value / maxValue, 1)) : 0;
  return { width: `${Math.round(ratio * 100)}%` };
}

function requireArtifactPayload<T>(payload: T | null, kind: EasyArtifact["kind"]): T {
  if (!payload) {
    throw new Error(`Easy artifact ${kind} is missing its typed payload`);
  }
  return payload;
}

function highlightElapsedLabel(startedAt: string | null, at: string): string {
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
