import { useEffect, useMemo, useState } from "react";

import type {
  Artifact,
  ArtifactMetadata,
  ReadConversationArtifactRequest,
} from "@generated/backend";
import { MarkdownText } from "../../components/markdown-text";
import {
  NarratorStatusReply,
  type EasyButtonNarratorStatusReply,
  usePresentedStatusReply,
} from "./easy-button-narrator-status";

export interface EasyButtonMilestone {
  at: string;
  id: string;
  text: string;
  turnStartedAt: string | null;
}

const maxRenderedArtifacts = 6;
const maxRenderedMilestones = 5;

type ArtifactReader = (request: ReadConversationArtifactRequest) => Promise<Artifact>;

type ArtifactPayloadCacheEntry =
  | { artifact: Artifact; status: "loaded" }
  | { promise: Promise<Artifact>; status: "loading" }
  | { error: string; status: "failed" };

const artifactPayloadCache = new Map<string, ArtifactPayloadCacheEntry>();

export function HighlightRail({
  milestones,
  speakingMilestoneId = null,
  statusReply = null,
}: {
  milestones: readonly EasyButtonMilestone[];
  speakingMilestoneId?: string | null;
  statusReply?: EasyButtonNarratorStatusReply | null;
}) {
  const visibleMilestones = milestones.slice(-maxRenderedMilestones);
  const presentedStatusReply = usePresentedStatusReply(statusReply);
  return (
    <aside
      aria-label={presentedStatusReply ? "Status and milestones" : "Milestones"}
      className="easy-button-rail easy-button-rail-left"
      data-easy-button-rail-empty={
        milestones.length === 0 && !presentedStatusReply ? "true" : "false"
      }
      data-easy-button-highlight-window-size={visibleMilestones.length}
    >
      <NarratorStatusReply reply={presentedStatusReply} />
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

export function ArtifactRail({
  artifacts,
  conversationId,
  readArtifact,
  workspaceId,
}: {
  artifacts: readonly ArtifactMetadata[];
  conversationId: string;
  readArtifact?: ArtifactReader;
  workspaceId: string | null;
}) {
  const visibleArtifacts = useMemo(() => artifacts.slice(-maxRenderedArtifacts), [artifacts]);
  useVisibleArtifactPayloads({
    artifacts: visibleArtifacts,
    conversationId,
    readArtifact,
    workspaceId,
  });
  return (
    <aside
      aria-label="Artifacts"
      className="easy-button-rail easy-button-rail-right"
      data-easy-button-rail-empty={artifacts.length === 0 ? "true" : "false"}
    >
      <p className="easy-button-rail-label">Artifacts</p>
      <div className="easy-button-artifact-stack" data-testid="easy-button-artifacts">
        {visibleArtifacts.map((artifact) => (
          <ArtifactCard
            artifact={artifact}
            cacheKey={
              workspaceId ? artifactPayloadCacheKey(workspaceId, conversationId, artifact.id) : null
            }
            key={artifact.id}
          />
        ))}
      </div>
    </aside>
  );
}

export function readVisibleArtifactPayloads({
  artifacts,
  conversationId,
  readArtifact,
  workspaceId,
}: {
  artifacts: readonly ArtifactMetadata[];
  conversationId: string;
  readArtifact: ArtifactReader;
  workspaceId: string;
}): Promise<Artifact[]> {
  return Promise.all(
    artifacts
      .slice(-maxRenderedArtifacts)
      .map((artifact) => readArtifactPayload(artifact, workspaceId, conversationId, readArtifact)),
  );
}

function useVisibleArtifactPayloads({
  artifacts,
  conversationId,
  readArtifact,
  workspaceId,
}: {
  artifacts: readonly ArtifactMetadata[];
  conversationId: string;
  readArtifact: ArtifactReader | undefined;
  workspaceId: string | null;
}) {
  const [, setRevision] = useState(0);
  const artifactIds = artifacts.map((artifact) => artifact.id).join("\x00");
  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    const reader = readArtifact ?? defaultArtifactReader();
    if (!reader) {
      return;
    }
    let active = true;
    for (const artifact of artifacts) {
      void readArtifactPayload(artifact, workspaceId, conversationId, reader)
        .finally(() => {
          if (active) {
            setRevision((revision) => revision + 1);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [artifactIds, artifacts, conversationId, readArtifact, workspaceId]);
}

function readArtifactPayload(
  metadata: ArtifactMetadata,
  workspaceId: string,
  conversationId: string,
  readArtifact: ArtifactReader,
): Promise<Artifact> {
  const cacheKey = artifactPayloadCacheKey(workspaceId, conversationId, metadata.id);
  const cached = artifactPayloadCache.get(cacheKey);
  if (cached?.status === "loaded") {
    return Promise.resolve(cached.artifact);
  }
  if (cached?.status === "loading") {
    return cached.promise;
  }
  const promise = readArtifact({ artifactId: metadata.id, conversationId, workspaceId })
    .then((artifact) => {
      validateArtifactPayloadIdentity(metadata, artifact);
      artifactPayloadCache.set(cacheKey, { artifact, status: "loaded" });
      return artifact;
    })
    .catch((error: unknown) => {
      artifactPayloadCache.set(cacheKey, { error: errorMessage(error), status: "failed" });
      throw error;
    });
  artifactPayloadCache.set(cacheKey, { promise, status: "loading" });
  return promise;
}

function artifactPayloadCacheKey(
  workspaceId: string,
  conversationId: string,
  artifactId: string,
): string {
  return `${workspaceId}\x00${conversationId}\x00${artifactId}`;
}

function validateArtifactPayloadIdentity(metadata: ArtifactMetadata, artifact: Artifact) {
  if (
    artifact.id !== metadata.id ||
    artifact.conversationId !== metadata.conversationId ||
    artifact.kind !== metadata.kind ||
    artifact.createdAt !== metadata.createdAt
  ) {
    throw new Error(`Artifact payload ${artifact.id} does not match its metadata`);
  }
}

function defaultArtifactReader(): ArtifactReader | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.setta.conversations.readArtifact ?? null;
}

function ArtifactCard({
  artifact,
  cacheKey,
}: {
  artifact: ArtifactMetadata;
  cacheKey: string | null;
}) {
  const payload = cacheKey ? artifactPayloadCache.get(cacheKey) : undefined;
  return (
    <article
      className="easy-button-artifact-card"
      data-artifact-id={artifact.id}
      data-artifact-kind={artifact.kind}
      data-artifact-load-state={payload?.status ?? "pending"}
    >
      <p className="easy-button-artifact-kicker">{artifactKindLabel(artifact.kind)}</p>
      {artifact.title ? <h2 className="easy-button-artifact-title">{artifact.title}</h2> : null}
      <ArtifactPayloadFrame entry={payload} />
    </article>
  );
}

function ArtifactPayloadFrame({ entry }: { entry: ArtifactPayloadCacheEntry | undefined }) {
  if (!entry || entry.status === "loading") {
    return <p className="easy-button-artifact-status">Loading artifact...</p>;
  }
  if (entry.status === "failed") {
    return (
      <p className="easy-button-artifact-status" role="alert">
        Artifact unavailable
      </p>
    );
  }
  return <ArtifactPayload artifact={entry.artifact} />;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
