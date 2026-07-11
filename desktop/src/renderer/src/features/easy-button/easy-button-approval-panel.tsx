import { useState } from "react";

import type {
  ConversationApprovalAnswer,
  TrajectoryApprovalDecision,
  TrajectoryApprovalQuestion,
  TrajectoryApprovalRequest,
} from "@generated/backend";

interface ConversationApprovalPanelProps {
  approval: TrajectoryApprovalRequest;
  pending: boolean;
  submit: (
    approval: TrajectoryApprovalRequest,
    decision: TrajectoryApprovalDecision,
    answers: ConversationApprovalAnswer[],
  ) => void;
}

export function ConversationApprovalPanel({
  approval,
  pending,
  submit,
}: ConversationApprovalPanelProps) {
  const [answerValues, setAnswerValues] = useState<Record<string, string>>({});
  const answers = approval.questions.map((question) => approvalAnswer(question.id, answerValues));
  const answerReady = answers.every((answer) => answer.answers.length > 0);
  const structured = approval.questions.length > 0;

  return (
    <section
      aria-label="Conversation approval"
      className="easy-button-approval"
      data-approval-id={approval.id}
      data-testid="easy-button-approval"
    >
      <p className="easy-button-approval-title">{approval.title}</p>
      <p className="easy-button-approval-body">{approval.body}</p>
      {approval.questions.map((question) => (
        <ApprovalQuestionField
          key={question.id}
          pending={pending}
          question={question}
          setValue={(value) => setAnswerValues((current) => ({ ...current, [question.id]: value }))}
          value={answerValues[question.id] ?? ""}
        />
      ))}
      <div className="easy-button-approval-actions">
        <button
          disabled={pending}
          onClick={() => submit(approval, structured ? "cancelled" : "denied", [])}
          type="button"
        >
          {structured ? "Cancel" : "Deny"}
        </button>
        <button
          disabled={pending || (structured && !answerReady)}
          onClick={() =>
            submit(approval, structured ? "answered" : "approved", structured ? answers : [])
          }
          type="button"
        >
          {structured ? "Answer" : "Approve"}
        </button>
      </div>
    </section>
  );
}

function ApprovalQuestionField({
  pending,
  question,
  setValue,
  value,
}: {
  pending: boolean;
  question: TrajectoryApprovalQuestion;
  setValue: (value: string) => void;
  value: string;
}) {
  const label = question.header || question.question;
  if (question.options.length > 0 && !question.allowsOther) {
    return (
      <label className="easy-button-approval-question">
        <span>{question.question}</span>
        <select
          aria-label={label}
          disabled={pending}
          onChange={(event) => setValue(event.target.value)}
          value={value}
        >
          <option value="">Select…</option>
          {question.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const listId = question.options.length > 0 ? `approval-options-${question.id}` : undefined;
  return (
    <label className="easy-button-approval-question">
      <span>{question.question}</span>
      <input
        aria-label={label}
        disabled={pending}
        list={listId}
        onChange={(event) => setValue(event.target.value)}
        value={value}
      />
      <ApprovalSuggestions listId={listId} options={question.options} />
    </label>
  );
}

function ApprovalSuggestions({
  listId,
  options,
}: {
  listId: string | undefined;
  options: readonly string[];
}) {
  if (!listId) {
    return null;
  }
  return (
    <datalist id={listId}>
      {options.map((option) => (
        <option key={option} value={option} />
      ))}
    </datalist>
  );
}

function approvalAnswer(
  questionId: string,
  values: Readonly<Record<string, string>>,
): ConversationApprovalAnswer {
  const value = values[questionId];
  const answers = value && value.trim() ? [value.trim()] : [];
  return { answers, questionId };
}
