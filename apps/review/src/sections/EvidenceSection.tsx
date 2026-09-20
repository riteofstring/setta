import { File, PatchDiff } from "@pierre/diffs/react";
import { NO_WHEEL_CLASS_NAME, type WorkspaceSection } from "@setta/workspace";

import { useReview } from "../app/reviewContext";
import { findRequestSnapshot } from "../app/reviewModel";
import type {
  EvidenceCitation,
  EvidenceRelation,
  JsonValue,
  ResolvedEvidenceContent,
} from "../backend/generatedContract";
import {
  evidenceReference,
  resolvedEvidence,
  sectionEvidenceId,
  sectionRequestId,
} from "./sectionModel";

const REVIEW_CODE_THEME = {
  dark: "nord",
  light: "github-light-default",
} as const;

function activeRelations(
  relations: readonly EvidenceRelation[],
  evidenceId: string,
  selection: ReturnType<typeof useReview>["selection"],
): EvidenceRelation[] {
  if (!selection) {
    return [];
  }
  return relations.filter(
    (relation) =>
      relation.evidenceId === evidenceId &&
      relation.subjectKind === selection.subjectKind &&
      relation.subjectId === selection.subjectId,
  );
}

function lineIsCited(
  lineNumber: number,
  citations: readonly EvidenceCitation[],
) {
  return citations.some(
    (citation) =>
      citation.kind === "lineRange" &&
      lineNumber >= citation.startLine &&
      lineNumber <= citation.endLine,
  );
}

function EvidenceContext({
  relations,
}: {
  relations: readonly EvidenceRelation[];
}) {
  if (relations.length === 0) {
    return null;
  }
  return (
    <div className="review-evidence-context" role="status">
      {relations.map((relation) => (
        <span data-role={relation.role} key={relation.id}>
          {relation.role}
        </span>
      ))}
    </div>
  );
}

function TextEvidence({
  content,
  citations,
}: {
  content: Extract<ResolvedEvidenceContent, { kind: "text" }>;
  citations: readonly EvidenceCitation[];
}) {
  return (
    <div className="review-code-lines" role="region" aria-label="Text evidence">
      {content.text.split("\n").map((line, index) => {
        const lineNumber = content.startLine + index;
        return (
          <div
            data-cited={lineIsCited(lineNumber, citations) || undefined}
            key={lineNumber}
          >
            <span>{lineNumber}</span>
            <code>{line || " "}</code>
          </div>
        );
      })}
      {content.truncated ? (
        <p>Evidence was truncated at the configured limit.</p>
      ) : null}
    </div>
  );
}

function jsonSummary(value: JsonValue): string {
  return JSON.stringify(value, null, 2);
}

function JsonEvidence({
  content,
  citations,
}: {
  content: Extract<ResolvedEvidenceContent, { kind: "json" }>;
  citations: readonly EvidenceCitation[];
}) {
  const pointers = citations.flatMap((citation) =>
    citation.kind === "jsonPointer" ? [citation.pointer] : [],
  );
  return (
    <div className="review-json-evidence">
      {pointers.length > 0 ? (
        <div aria-label="Focused JSON values" className="review-json-pointers">
          {pointers.map((pointer) => (
            <code key={pointer}>{pointer || "/"}</code>
          ))}
        </div>
      ) : null}
      <File
        disableWorkerPool
        file={{
          contents: jsonSummary(content.json),
          lang: "json",
          name: "evidence.json",
        }}
        options={{
          disableFileHeader: true,
          disableLineNumbers: true,
          overflow: "scroll",
          theme: REVIEW_CODE_THEME,
          themeType: "system",
        }}
      />
    </div>
  );
}

function DiffEvidence({
  content,
}: {
  content: Extract<ResolvedEvidenceContent, { kind: "gitDiff" }>;
}) {
  return (
    <div className="review-diff-evidence">
      <PatchDiff
        disableWorkerPool
        options={{
          diffStyle: "unified",
          disableFileHeader: true,
          hunkSeparators: "line-info",
          overflow: "wrap",
          theme: REVIEW_CODE_THEME,
          themeType: "system",
        }}
        patch={content.unifiedDiff}
      />
      {content.truncated ? (
        <p>Diff was truncated at the configured limit.</p>
      ) : null}
    </div>
  );
}

export function EvidenceSection({ section }: { section: WorkspaceSection }) {
  const review = useReview();
  const requestId = sectionRequestId(section);
  const evidenceId = sectionEvidenceId(section);
  const snapshot = findRequestSnapshot(review.snapshot.requests, requestId);
  const reference = evidenceReference(snapshot, evidenceId);
  const resolved = resolvedEvidence(snapshot, evidenceId);
  const relations = activeRelations(
    snapshot.request.relations,
    evidenceId,
    review.selection,
  );
  const citations = relations.flatMap((relation) => relation.citations);

  if (reference.kind === "artifact") {
    throw new Error(
      `Artifact evidence ${evidenceId} requires an artifact section.`,
    );
  }

  return (
    <div
      className={`review-evidence ${NO_WHEEL_CLASS_NAME}`}
      data-focused={relations.length > 0 || undefined}
      onPointerDown={() => review.actions.selectEvidence(requestId, evidenceId)}
    >
      <EvidenceContext relations={relations} />
      {resolved.status === "failed" ? (
        <div className="review-evidence-failure" role="alert">
          <strong>Evidence unavailable</strong>
          <p>{resolved.error.message}</p>
        </div>
      ) : resolved.content.kind === "gitDiff" ? (
        <DiffEvidence content={resolved.content} />
      ) : resolved.content.kind === "text" ? (
        <TextEvidence citations={citations} content={resolved.content} />
      ) : resolved.content.kind === "json" ? (
        <JsonEvidence citations={citations} content={resolved.content} />
      ) : (
        <div className="review-evidence-failure" role="alert">
          Unexpected evidence kind.
        </div>
      )}
    </div>
  );
}
