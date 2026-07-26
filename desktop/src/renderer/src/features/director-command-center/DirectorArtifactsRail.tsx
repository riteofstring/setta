import type {
  ApprovalRequest,
  ArtifactStatus,
  ConversationApprovalAnswer,
  DirectorIntent,
  DirectorReceipt,
  ResourceRequest,
  TrajectoryApprovalDecision,
  TrajectoryApprovalQuestion,
  WorkstreamArtifact,
  WorkspaceSession,
  WorkspaceSummary,
} from "@generated/backend";
import { Check, FolderOpen, FolderPlus, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { TooltipProvider } from "@renderer/components/ui/tooltip";

import { DirectorArtifactPreviewCard } from "./DirectorArtifactPreviewCard";
import { directorRailArtifacts, type DirectorArtifactBrowser } from "./director-artifact-browser";

const artifactArrivalLabels = {
  available: "Artifact ready",
  declared: "Artifact declared",
  unresolved: "Artifact pending",
} as const satisfies Record<ArtifactStatus, string>;

export function ArtifactsRail({
  approvals,
  artifactBrowser,
  artifacts,
  dispatch,
  dispatching,
  openLocalFolder,
  openWorkspacePath,
  requests,
  workspaceSession,
}: {
  approvals: readonly ApprovalRequest[];
  artifactBrowser: DirectorArtifactBrowser;
  artifacts: readonly WorkstreamArtifact[];
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  dispatching: boolean;
  openLocalFolder: () => Promise<WorkspaceSummary | null>;
  openWorkspacePath: (rootPath: string) => Promise<WorkspaceSummary>;
  requests: readonly ResourceRequest[];
  workspaceSession: WorkspaceSession | null;
}) {
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
        <WorkspaceStartPanel
          disabled={dispatching}
          dispatch={dispatch}
          openLocalFolder={openLocalFolder}
          openWorkspacePath={openWorkspacePath}
          workspaceSession={workspaceSession}
        />
      </section>
      <section className="director-rail-section">
        <p className="director-rail-kicker">Artifacts</p>
        <TooltipProvider>
          <div className="director-artifact-gallery">
            {directorRailArtifacts(artifacts).map((artifact) => (
              <DirectorArtifactPreviewCard
                artifact={artifact}
                documents={artifactBrowser.documents}
                isActive={artifactBrowser.activeArtifact?.id === artifact.id}
                key={artifact.id}
                onOpen={artifactBrowser.open}
              />
            ))}
            {artifacts.length === 0 ? (
              <p className="director-rail-summary">No artifacts yet.</p>
            ) : null}
          </div>
        </TooltipProvider>
      </section>
    </aside>
  );
}

export function directorRailArrivalAnnouncement(
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
      announcedAt: artifact.updatedAt,
      text: `${artifactArrivalLabels[artifact.status]}: ${artifact.title}`,
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

function WorkspaceStartPanel({
  disabled,
  dispatch,
  openLocalFolder,
  openWorkspacePath,
  workspaceSession,
}: {
  disabled: boolean;
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  openLocalFolder: () => Promise<WorkspaceSummary | null>;
  openWorkspacePath: (rootPath: string) => Promise<WorkspaceSummary>;
  workspaceSession: WorkspaceSession | null;
}) {
  const titleId = useId();
  const errorId = useId();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeWorkspaces = availableWorkspaceStartChoices(workspaceSession);
  const recentWorkspaces = recentWorkspaceStartChoices(workspaceSession, activeWorkspaces);
  const startInWorkspace = async (workspace: WorkspaceSummary): Promise<void> => {
    setError(null);
    setStarting(workspace.id);
    try {
      await dispatch(createWorkstreamIntent(workspace.id, workspaceWorkstreamTitle(workspace)));
    } catch {
      setError("Setta could not start in that folder.");
    } finally {
      setStarting(null);
    }
  };
  const startFromRecent = async (workspace: WorkspaceSummary): Promise<void> => {
    setError(null);
    setStarting(workspace.id);
    try {
      const opened = await openWorkspacePath(workspace.rootPath);
      await dispatch(createWorkstreamIntent(opened.id, workspaceWorkstreamTitle(opened)));
    } catch {
      setError("Setta could not start in that folder.");
    } finally {
      setStarting(null);
    }
  };
  const chooseFolder = async (): Promise<void> => {
    setError(null);
    setStarting("choose-folder");
    try {
      const workspace = await openLocalFolder();
      if (workspace !== null) {
        await dispatch(createWorkstreamIntent(workspace.id, workspaceWorkstreamTitle(workspace)));
      }
    } catch {
      setError("Setta could not start in that folder.");
    } finally {
      setStarting(null);
    }
  };
  return (
    <div className="director-workspace-start" aria-labelledby={titleId} role="group">
      <p className="director-resource-subtitle" id={titleId}>
        New workstream
      </p>
      <div className="director-resource-options director-workspace-start-options">
        {activeWorkspaces.map((workspace) => (
          <button
            aria-describedby={error ? errorId : undefined}
            aria-label={`Start new workstream in ${workspace.displayName}`}
            disabled={disabled || starting !== null}
            key={workspace.id}
            onClick={() => {
              void startInWorkspace(workspace);
            }}
            title={`Start new workstream in ${workspace.displayName}`}
            type="button"
          >
            <FolderOpen aria-hidden="true" size={14} />
            <span>{starting === workspace.id ? "Starting…" : workspace.displayName}</span>
          </button>
        ))}
        {recentWorkspaces.map((workspace) => (
          <button
            aria-describedby={error ? errorId : undefined}
            aria-label={`Reopen ${workspace.displayName} and start new workstream`}
            data-source="recent"
            disabled={disabled || starting !== null}
            key={workspace.id}
            onClick={() => {
              void startFromRecent(workspace);
            }}
            title={`Reopen ${workspace.displayName} and start new workstream`}
            type="button"
          >
            <FolderOpen aria-hidden="true" size={14} />
            <span>{starting === workspace.id ? "Opening…" : workspace.displayName}</span>
          </button>
        ))}
        <button
          aria-describedby={error ? errorId : undefined}
          disabled={disabled || starting !== null}
          onClick={() => {
            void chooseFolder();
          }}
          type="button"
        >
          <FolderPlus aria-hidden="true" size={14} />
          <span>{starting === "choose-folder" ? "Opening…" : "Choose folder"}</span>
        </button>
      </div>
      <p className="director-resource-error" id={errorId} role="alert">
        {error}
      </p>
    </div>
  );
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

function availableWorkspaceStartChoices(
  workspaceSession: WorkspaceSession | null,
): WorkspaceSummary[] {
  if (workspaceSession === null) {
    return [];
  }
  const unavailable = new Set(
    workspaceSession.workspaceAvailabilities
      .filter((availability) => !availability.available)
      .map((availability) => availability.workspaceId),
  );
  return workspaceSession.activeWorkspaces.filter((workspace) => !unavailable.has(workspace.id));
}

function recentWorkspaceStartChoices(
  workspaceSession: WorkspaceSession | null,
  activeWorkspaces: readonly WorkspaceSummary[],
): WorkspaceSummary[] {
  if (workspaceSession === null) {
    return [];
  }
  const activeIds = new Set(activeWorkspaces.map((workspace) => workspace.id));
  return workspaceSession.recentWorkspaces
    .filter((workspace) => !activeIds.has(workspace.id))
    .slice(0, 4);
}

function workspaceWorkstreamTitle(workspace: WorkspaceSummary): string {
  const title = workspace.displayName.trim();
  return title.length > 0 ? title : "New workstream";
}

function resolveApprovalIntent(
  approvalId: string,
  decision: TrajectoryApprovalDecision,
  answers: ConversationApprovalAnswer[] = [],
): DirectorIntent {
  return {
    cancelRun: null,
    createWorkstream: null,
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
    createWorkstream: null,
    kind: "resolve_resource_request",
    moveSelection: null,
    resolveApproval: null,
    resolveResourceRequest: { requestId, workspaceId },
    selectWorkstream: null,
    submit: null,
  };
}

function createWorkstreamIntent(workspaceId: string, title: string): DirectorIntent {
  return {
    cancelRun: null,
    createWorkstream: { title, workspaceId },
    kind: "create_workstream",
    moveSelection: null,
    resolveApproval: null,
    resolveResourceRequest: null,
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
