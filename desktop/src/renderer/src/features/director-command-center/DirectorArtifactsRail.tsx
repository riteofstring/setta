import type {
  Artifact,
  ApprovalRequest,
  ArtifactKind,
  ConversationApprovalAnswer,
  DirectorIntent,
  DirectorReceipt,
  ReadConversationArtifactRequest,
  ResourceRequest,
  TrajectoryApprovalDecision,
  TrajectoryApprovalQuestion,
  WorkstreamArtifact,
  WorkspaceSession,
  WorkspaceSummary,
} from "@generated/backend";
import { Check, FileText, FolderOpen, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { MarkdownText } from "../../components/markdown-text";

const artifactLabels = {
  bar_chart: "Chart",
  file: "File",
  markdown: "Markdown",
  table: "Table",
} as const satisfies Record<ArtifactKind, string>;

export function ArtifactsRail({
  approvals,
  artifacts,
  dispatch,
  dispatching,
  openLocalFolder,
  readArtifact,
  requests,
  workspaceSession,
}: {
  approvals: readonly ApprovalRequest[];
  artifacts: readonly WorkstreamArtifact[];
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  dispatching: boolean;
  openLocalFolder: () => Promise<WorkspaceSummary | null>;
  readArtifact?: (request: ReadConversationArtifactRequest) => Promise<Artifact>;
  requests: readonly ResourceRequest[];
  workspaceSession: WorkspaceSession | null;
}) {
  const [artifactDetail, setArtifactDetail] = useState<ArtifactDetailState | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);
  const lastArtifactTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (artifactDetail !== null) {
      detailRef.current?.focus();
    }
  }, [artifactDetail?.artifact.id, artifactDetail?.status]);

  const closeArtifactDetail = useCallback(() => {
    setArtifactDetail(null);
    lastArtifactTriggerRef.current?.focus();
  }, []);

  const openArtifactDetail = useCallback(
    async (artifact: WorkstreamArtifact, trigger: HTMLButtonElement): Promise<void> => {
      lastArtifactTriggerRef.current = trigger;
      if (!readArtifact || artifact.status !== "available") {
        setArtifactDetail({
          artifact,
          error: "Artifact details are not available yet.",
          status: "failed",
        });
        return;
      }
      setArtifactDetail({ artifact, status: "loading" });
      try {
        const payload = await readArtifact({
          artifactId: artifact.id,
          conversationId: artifact.conversationId,
          workspaceId: artifact.workspaceId,
        });
        validateDirectorArtifactPayload(artifact, payload);
        setArtifactDetail((current) =>
          current?.artifact.id === artifact.id ? { artifact, payload, status: "loaded" } : current,
        );
      } catch {
        setArtifactDetail((current) =>
          current?.artifact.id === artifact.id
            ? {
                artifact,
                error: "Setta could not open this artifact. Try again.",
                status: "failed",
              }
            : current,
        );
      }
    },
    [readArtifact],
  );

  return (
    <aside aria-label="Artifacts" className="director-artifacts-rail" id="director-artifacts-rail">
      <span aria-atomic="true" className="sr-only" role="status">
        {directorRailArrivalAnnouncement(approvals, requests, artifacts)}
      </span>
      <section className="director-rail-section">
        <p className="director-rail-kicker">Approvals</p>
        <div className="director-action-list">
          {approvals.length === 0 ? (
            <p className="director-rail-summary">No approvals are waiting.</p>
          ) : (
            approvals.map((approval) => (
              <ApprovalItem
                approval={approval}
                dispatch={dispatch}
                disabled={dispatching}
                key={approval.id}
              />
            ))
          )}
        </div>
      </section>
      <section className="director-rail-section">
        <p className="director-rail-kicker">Resources</p>
        <div className="director-action-list">
          {requests.length === 0 ? (
            <p className="director-rail-summary">No folders are waiting.</p>
          ) : (
            requests.map((request) => (
              <ResourceRequestItem
                disabled={dispatching}
                dispatch={dispatch}
                key={request.id}
                openLocalFolder={openLocalFolder}
                request={request}
                workspaceSession={workspaceSession}
              />
            ))
          )}
        </div>
      </section>
      <section className="director-rail-section">
        <p className="director-rail-kicker">Artifacts</p>
        <div className="director-artifact-list">
          {artifacts.slice(0, 8).map((artifact) => (
            <button
              aria-label={`Open artifact details: ${artifact.title}`}
              className="director-artifact-item"
              data-artifact-id={artifact.id}
              data-artifact-kind={artifact.kind}
              data-artifact-status={artifact.status}
              disabled={artifact.status !== "available" || !readArtifact}
              key={artifact.id}
              onClick={(event) => {
                void openArtifactDetail(artifact, event.currentTarget);
              }}
              type="button"
            >
              <FileText aria-hidden="true" size={15} />
              <div>
                <p>{artifact.title}</p>
                <span>
                  {artifactLabels[artifact.kind]}
                  {artifact.status === "available" ? "" : " pending"}
                </span>
              </div>
            </button>
          ))}
          {artifacts.length === 0 ? (
            <p className="director-rail-summary">No artifacts yet.</p>
          ) : null}
        </div>
      </section>
      {artifactDetail ? (
        <ArtifactDetailPanel
          detail={artifactDetail}
          onClose={closeArtifactDetail}
          panelRef={(node) => {
            detailRef.current = node;
          }}
        />
      ) : null}
    </aside>
  );
}

function directorRailArrivalAnnouncement(
  approvals: readonly ApprovalRequest[],
  requests: readonly ResourceRequest[],
  artifacts: readonly WorkstreamArtifact[],
): string {
  const arrivals = [
    ...approvals.map((approval) => ({
      announcedAt: approval.requestedAt,
      text: `Approval waiting: ${approval.publicSummary}`,
    })),
    ...requests.map((request) => ({
      announcedAt: request.requestedAt,
      text: `Resource waiting: ${request.publicSummary}`,
    })),
    ...artifacts.map((artifact) => ({
      announcedAt: artifact.createdAt,
      text: `Artifact available: ${artifact.title}`,
    })),
  ];
  let latest: (typeof arrivals)[number] | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;
  for (const arrival of arrivals) {
    const timestamp = Date.parse(arrival.announcedAt);
    if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {
      latest = arrival;
      latestTimestamp = timestamp;
    }
  }
  return latest?.text ?? "";
}

function ApprovalItem({
  approval,
  disabled,
  dispatch,
}: {
  approval: ApprovalRequest;
  disabled: boolean;
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
}) {
  if (approval.questions.length > 0) {
    return (
      <article className="director-action-item" data-approval-id={approval.id}>
        <p>{approval.publicSummary}</p>
        <ApprovalQuestionForm approval={approval} disabled={disabled} dispatch={dispatch} />
      </article>
    );
  }
  return (
    <article className="director-action-item" data-approval-id={approval.id}>
      <p>{approval.publicSummary}</p>
      <div className="director-action-controls">
        <button
          disabled={disabled}
          onClick={() =>
            dispatchDirectorIntent(dispatch, resolveApprovalIntent(approval.id, "denied"))
          }
          type="button"
        >
          <X aria-hidden="true" size={14} />
          <span>Deny</span>
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            dispatchDirectorIntent(dispatch, resolveApprovalIntent(approval.id, "approved"))
          }
          type="button"
        >
          <Check aria-hidden="true" size={14} />
          <span>Approve</span>
        </button>
      </div>
    </article>
  );
}

function ApprovalQuestionForm({
  approval,
  disabled,
  dispatch,
}: {
  approval: ApprovalRequest;
  disabled: boolean;
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
}) {
  const formId = useId();
  const [values, setValues] = useState<ApprovalAnswerValues>(() =>
    initialApprovalAnswerValues(approval.questions),
  );
  const [errors, setErrors] = useState<ApprovalAnswerErrors>({});
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    setValues(initialApprovalAnswerValues(approval.questions));
    setErrors({});
  }, [approval.id, approval.questions]);

  const submitAnswers = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const result = buildApprovalAnswers(approval.questions, values);
    if (result.status === "invalid") {
      setErrors(result.errors);
      focusApprovalQuestion(fieldRefs.current, result.firstInvalidQuestionId);
      return;
    }
    setErrors({});
    dispatchDirectorIntent(
      dispatch,
      resolveApprovalIntent(approval.id, "answered", result.answers),
    );
  };

  return (
    <form className="director-approval-form" onSubmit={submitAnswers}>
      {approval.questions.map((question) => (
        <ApprovalQuestionField
          error={errors[question.id] ?? null}
          fieldId={approvalQuestionFieldId(formId, question.id)}
          key={question.id}
          onValueChange={(value) => {
            setValues((current) => ({ ...current, [question.id]: value }));
            if (errors[question.id]) {
              setErrors(withoutAnswerError(question.id));
            }
          }}
          question={question}
          refCallback={(node) => {
            fieldRefs.current[question.id] = node;
          }}
          value={values[question.id] ?? ""}
        />
      ))}
      <div className="director-action-controls">
        <button
          disabled={disabled}
          onClick={() =>
            dispatchDirectorIntent(dispatch, resolveApprovalIntent(approval.id, "cancelled"))
          }
          type="button"
        >
          <X aria-hidden="true" size={14} />
          <span>Cancel</span>
        </button>
        <button disabled={disabled} type="submit">
          <Check aria-hidden="true" size={14} />
          <span>Answer</span>
        </button>
      </div>
    </form>
  );
}

interface ApprovalQuestionFieldProps {
  error: string | null;
  fieldId: string;
  onValueChange: (value: string) => void;
  question: TrajectoryApprovalQuestion;
  refCallback: (node: HTMLElement | null) => void;
  value: string;
}

function ApprovalQuestionField({
  error,
  fieldId,
  onValueChange,
  question,
  refCallback,
  value,
}: ApprovalQuestionFieldProps) {
  const optionsAreFixed = question.options.length > 0 && !question.allowsOther;
  return (
    <div className="director-approval-question" data-secret={question.secret ? "true" : "false"}>
      <label htmlFor={fieldId}>
        <span>{question.header}</span>
        <span>{question.question}</span>
      </label>
      {optionsAreFixed ? (
        <ApprovalQuestionSelect
          error={error}
          fieldId={fieldId}
          onValueChange={onValueChange}
          options={question.options}
          questionId={question.id}
          refCallback={refCallback}
          value={value}
        />
      ) : (
        <ApprovalQuestionInput
          error={error}
          fieldId={fieldId}
          onValueChange={onValueChange}
          question={question}
          refCallback={refCallback}
          value={value}
        />
      )}
      <ApprovalQuestionError error={error} fieldId={fieldId} />
    </div>
  );
}

function ApprovalQuestionSelect({
  error,
  fieldId,
  onValueChange,
  options,
  questionId,
  refCallback,
  value,
}: {
  error: string | null;
  fieldId: string;
  onValueChange: (value: string) => void;
  options: readonly string[];
  questionId: string;
  refCallback: (node: HTMLElement | null) => void;
  value: string;
}) {
  return (
    <select
      {...approvalFieldCommonProps({ error, fieldId, onValueChange, questionId, value })}
      ref={refCallback}
    >
      <option value="">Select an answer</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function ApprovalQuestionInput({
  error,
  fieldId,
  onValueChange,
  question,
  refCallback,
  value,
}: {
  error: string | null;
  fieldId: string;
  onValueChange: (value: string) => void;
  question: TrajectoryApprovalQuestion;
  refCallback: (node: HTMLElement | null) => void;
  value: string;
}) {
  return (
    <>
      <input
        {...approvalFieldCommonProps({
          error,
          fieldId,
          onValueChange,
          questionId: question.id,
          value,
        })}
        autoComplete="off"
        list={question.options.length > 0 ? `${fieldId}-options` : undefined}
        ref={refCallback}
        type={question.secret ? "password" : "text"}
      />
      {question.options.length > 0 ? (
        <datalist id={`${fieldId}-options`}>
          {question.options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}

function ApprovalQuestionError({ error, fieldId }: { error: string | null; fieldId: string }) {
  if (!error) {
    return null;
  }
  return (
    <p className="director-approval-error" id={`${fieldId}-error`} role="alert">
      {error}
    </p>
  );
}

function approvalFieldCommonProps({
  error,
  fieldId,
  onValueChange,
  questionId,
  value,
}: {
  error: string | null;
  fieldId: string;
  onValueChange: (value: string) => void;
  questionId: string;
  value: string;
}) {
  return {
    "aria-describedby": error ? `${fieldId}-error` : undefined,
    "aria-invalid": error ? ("true" as const) : undefined,
    id: fieldId,
    name: questionId,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      onValueChange(event.currentTarget.value);
    },
    value,
  };
}

type ApprovalAnswerValues = Record<string, string>;
type ApprovalAnswerErrors = Record<string, string>;

type ApprovalAnswerBuildResult =
  | { answers: ConversationApprovalAnswer[]; status: "valid" }
  | {
      errors: ApprovalAnswerErrors;
      firstInvalidQuestionId: string;
      status: "invalid";
    };

function initialApprovalAnswerValues(
  questions: readonly TrajectoryApprovalQuestion[],
): ApprovalAnswerValues {
  return Object.fromEntries(questions.map((question) => [question.id, ""]));
}

export function buildApprovalAnswers(
  questions: readonly TrajectoryApprovalQuestion[],
  values: ApprovalAnswerValues,
): ApprovalAnswerBuildResult {
  const built = questions.reduce<{
    answers: ConversationApprovalAnswer[];
    errors: ApprovalAnswerErrors;
    firstInvalidQuestionId: string | null;
  }>((current, question) => appendApprovalAnswer(current, question, values[question.id] ?? ""), {
    answers: [],
    errors: {},
    firstInvalidQuestionId: null,
  });
  if (built.firstInvalidQuestionId !== null) {
    return {
      errors: built.errors,
      firstInvalidQuestionId: built.firstInvalidQuestionId,
      status: "invalid",
    };
  }
  return { answers: built.answers, status: "valid" };
}

function appendApprovalAnswer(
  current: {
    answers: ConversationApprovalAnswer[];
    errors: ApprovalAnswerErrors;
    firstInvalidQuestionId: string | null;
  },
  question: TrajectoryApprovalQuestion,
  rawValue: string,
) {
  const value = rawValue.trim();
  const error = approvalAnswerError(question, value);
  if (error) {
    return {
      ...current,
      errors: { ...current.errors, [question.id]: error },
      firstInvalidQuestionId: current.firstInvalidQuestionId ?? question.id,
    };
  }
  return {
    ...current,
    answers: [...current.answers, { answers: [value], questionId: question.id }],
  };
}

function approvalAnswerError(question: TrajectoryApprovalQuestion, value: string): string | null {
  if (value === "") {
    return "Answer this question.";
  }
  if (question.options.length > 0 && !question.allowsOther && !question.options.includes(value)) {
    return "Choose one of the listed answers.";
  }
  return null;
}

function focusApprovalQuestion(fields: Record<string, HTMLElement | null>, questionId: string) {
  const focusFirstInvalid = () => {
    fields[questionId]?.focus();
  };
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(focusFirstInvalid);
  } else {
    focusFirstInvalid();
  }
}

function withoutAnswerError(questionId: string) {
  return (current: ApprovalAnswerErrors): ApprovalAnswerErrors => {
    const next = { ...current };
    delete next[questionId];
    return next;
  };
}

function approvalQuestionFieldId(formId: string, questionId: string): string {
  return `director-approval-${formId}-${questionId}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

function ResourceRequestItem({
  disabled,
  dispatch,
  openLocalFolder,
  request,
  workspaceSession,
}: {
  disabled: boolean;
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  openLocalFolder: () => Promise<WorkspaceSummary | null>;
  request: ResourceRequest;
  workspaceSession: WorkspaceSession | null;
}) {
  const errorId = useId();
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workspaces = workspaceSession?.activeWorkspaces ?? [];
  const bindWorkspace = async (workspaceId: string): Promise<void> => {
    setError(null);
    setResolving(true);
    try {
      await dispatch(resolveResourceRequestIntent(request.id, workspaceId));
    } catch {
      setError("Setta could not use that folder. Choose another folder.");
    } finally {
      setResolving(false);
    }
  };
  const chooseFolder = async (): Promise<void> => {
    setError(null);
    setResolving(true);
    let workspace: WorkspaceSummary | null;
    try {
      workspace = await openLocalFolder();
    } catch {
      setError("Setta could not open a folder. Try again.");
      setResolving(false);
      return;
    }
    if (workspace === null) {
      setResolving(false);
      return;
    }
    await bindWorkspace(workspace.id);
  };
  return (
    <article className="director-action-item" data-resource-request-id={request.id}>
      <p>{request.publicSummary}</p>
      <div className="director-resource-options">
        {workspaces.map((workspace) => (
          <button
            aria-describedby={error ? errorId : undefined}
            disabled={disabled || resolving}
            key={workspace.id}
            onClick={() => {
              void bindWorkspace(workspace.id);
            }}
            type="button"
          >
            <FolderOpen aria-hidden="true" size={14} />
            <span>{workspace.displayName}</span>
          </button>
        ))}
        <button
          aria-describedby={error ? errorId : undefined}
          disabled={disabled || resolving}
          onClick={() => {
            void chooseFolder();
          }}
          type="button"
        >
          <FolderOpen aria-hidden="true" size={14} />
          <span>{resolving ? "Using folder…" : "Choose folder"}</span>
        </button>
        {workspaces.length === 0 ? <span>Choose a folder to continue.</span> : null}
      </div>
      {error ? (
        <p className="director-resource-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}

type ArtifactDetailState =
  | { artifact: WorkstreamArtifact; status: "loading" }
  | { artifact: WorkstreamArtifact; error: string; status: "failed" }
  | { artifact: WorkstreamArtifact; payload: Artifact; status: "loaded" };

function ArtifactDetailPanel({
  detail,
  onClose,
  panelRef,
}: {
  detail: ArtifactDetailState;
  onClose: () => void;
  panelRef: (node: HTMLElement | null) => void;
}) {
  const headingId = `director-artifact-detail-${detail.artifact.id}`.replace(
    /[^A-Za-z0-9_-]/g,
    "_",
  );
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };
  return (
    <section
      aria-labelledby={headingId}
      className="director-artifact-detail"
      data-artifact-id={detail.artifact.id}
      data-artifact-kind={detail.artifact.kind}
      data-artifact-load-state={detail.status}
      onKeyDown={onKeyDown}
      ref={panelRef}
      tabIndex={-1}
    >
      <header>
        <div>
          <p className="director-artifact-detail-kicker">{artifactLabels[detail.artifact.kind]}</p>
          <h2 id={headingId}>{detail.artifact.title}</h2>
        </div>
        <button
          aria-label="Close artifact details"
          className="director-artifact-detail-close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={15} />
        </button>
      </header>
      <ArtifactDetailBody detail={detail} />
    </section>
  );
}

function ArtifactDetailBody({ detail }: { detail: ArtifactDetailState }) {
  switch (detail.status) {
    case "loading":
      return (
        <p className="director-artifact-detail-status" role="status">
          Loading artifact.
        </p>
      );
    case "failed":
      return (
        <p className="director-artifact-detail-status" role="alert">
          {detail.error}
        </p>
      );
    case "loaded":
      return <ArtifactPayload artifact={detail.payload} />;
    default:
      return exhaustiveArtifactDetail(detail);
  }
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
    default:
      return exhaustiveArtifactKind(artifact.kind);
  }
}

function MarkdownArtifact({ artifact }: { artifact: Artifact }) {
  const payload = requireArtifactPayload(artifact.markdown, artifact.kind);
  return (
    <div className="director-artifact-markdown">
      <MarkdownText text={payload.markdown} />
    </div>
  );
}

function TableArtifact({ artifact }: { artifact: Artifact }) {
  const payload = requireArtifactPayload(artifact.table, artifact.kind);
  return (
    <div className="director-artifact-table-wrap">
      <table className="director-artifact-table">
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
    <div className="director-artifact-bars">
      {payload.items.map((item) => (
        <div className="director-artifact-bar-row" key={item.label}>
          <span className="director-artifact-bar-label">{item.label}</span>
          <div className="director-artifact-bar-track">
            <span
              aria-label={`${item.label}: ${formatArtifactValue(item.value, item.unit)}`}
              className="director-artifact-bar"
              style={{
                width: `${maxValue > 0 ? Math.max((item.value / maxValue) * 100, 2) : 0}%`,
              }}
            />
            <span className="director-artifact-bar-value">
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
    <div className="director-artifact-file">
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
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function validateDirectorArtifactPayload(metadata: WorkstreamArtifact, artifact: Artifact): void {
  if (
    artifact.id !== metadata.id ||
    artifact.conversationId !== metadata.conversationId ||
    artifact.kind !== metadata.kind
  ) {
    throw new Error(`Artifact payload ${artifact.id} does not match its Director record.`);
  }
}

function resolveApprovalIntent(
  approvalId: string,
  decision: TrajectoryApprovalDecision,
  answers: ConversationApprovalAnswer[] = [],
): DirectorIntent {
  return {
    cancelRun: null,
    kind: "resolve_approval",
    moveSelection: null,
    resolveApproval: { answers, approvalId, decision },
    resolveResourceRequest: null,
    selectWorkstream: null,
    submit: null,
  };
}

function resolveResourceRequestIntent(requestId: string, workspaceId: string): DirectorIntent {
  return {
    cancelRun: null,
    kind: "resolve_resource_request",
    moveSelection: null,
    resolveApproval: null,
    resolveResourceRequest: { requestId, workspaceId },
    selectWorkstream: null,
    submit: null,
  };
}

function dispatchDirectorIntent(
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>,
  intent: DirectorIntent,
): void {
  void dispatch(intent).catch(() => {});
}

function exhaustiveArtifactDetail(state: never): never {
  throw new Error(`unsupported artifact detail state ${JSON.stringify(state)}`);
}

function exhaustiveArtifactKind(kind: never): never {
  throw new Error(`unsupported artifact kind ${kind}`);
}
