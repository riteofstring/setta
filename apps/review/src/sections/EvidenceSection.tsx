import { PatchDiff } from "@pierre/diffs/react";
import {
  createWorkspaceCodeSection,
  createWorkspaceCodeSectionData,
  NO_WHEEL_CLASS_NAME,
  type WorkspaceCodeSectionLanguage,
  type WorkspaceSection,
} from "@setta/workspace";

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

const REVIEW_DIFF_THEME = {
  dark: "vesper",
  light: "github-light-default",
} as const;

const CODE_SECTION = createWorkspaceCodeSection();

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

function lineCitationLabels(citations: readonly EvidenceCitation[]): string[] {
  return citations.flatMap((citation) => {
    if (citation.kind !== "lineRange") {
      return [];
    }
    return [
      citation.startLine === citation.endLine
        ? `Line ${String(citation.startLine)}`
        : `Lines ${String(citation.startLine)}–${String(citation.endLine)}`,
    ];
  });
}

function CodeEvidence({
  code,
  language,
  locations,
  section,
}: {
  code: string;
  language: WorkspaceCodeSectionLanguage;
  locations: readonly string[];
  section: WorkspaceSection;
}) {
  const codeSection = {
    ...section,
    data: createWorkspaceCodeSectionData({
      code,
      language,
      mode: "read-only",
    }),
  };
  return (
    <div className="review-code-evidence">
      {locations.length > 0 ? (
        <div
          aria-label="Focused evidence locations"
          className="review-evidence-locations"
        >
          {locations.map((location, index) => (
            <code key={`${location}:${String(index)}`}>{location}</code>
          ))}
        </div>
      ) : null}
      {CODE_SECTION.renderContent(codeSection)}
    </div>
  );
}

function JsonEvidence({
  content,
  citations,
  section,
}: {
  content: Extract<ResolvedEvidenceContent, { kind: "json" }>;
  citations: readonly EvidenceCitation[];
  section: WorkspaceSection;
}) {
  const pointers = citations.flatMap((citation) =>
    citation.kind === "jsonPointer" ? [citation.pointer] : [],
  );
  return (
    <CodeEvidence
      code={jsonSummary(content.json)}
      language="json"
      locations={pointers.map((pointer) => pointer || "/")}
      section={section}
    />
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
          hunkSeparators: "simple",
          overflow: "wrap",
          theme: REVIEW_DIFF_THEME,
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
      ) : resolved.content.kind === "code" ? (
        <CodeEvidence
          code={resolved.content.code}
          language={resolved.content.language}
          locations={lineCitationLabels(citations)}
          section={section}
        />
      ) : resolved.content.kind === "text" ? (
        <TextEvidence citations={citations} content={resolved.content} />
      ) : resolved.content.kind === "json" ? (
        <JsonEvidence
          citations={citations}
          content={resolved.content}
          section={section}
        />
      ) : (
        <div className="review-evidence-failure" role="alert">
          Unexpected evidence kind.
        </div>
      )}
    </div>
  );
}
