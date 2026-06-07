import type { ApprovalAnswer, ApprovalQuestion, ApprovalRequest } from "@generated/backend";
import { Check, X } from "lucide-react";
import { useState } from "react";

import { StructuredInputApproval } from "./structured-input-approval";
import { Button } from "./ui/button";

export type SubmitApproval = (
  approvalId: string,
  approved: boolean,
  response: string,
  answers: ApprovalAnswer[],
  cancelled: boolean,
) => Promise<void>;

export function ApprovalCard({
  approval,
  submitApproval,
}: {
  approval: ApprovalRequest;
  submitApproval: SubmitApproval;
}) {
  return (
    <section
      className="min-w-0 rounded-md border border-status-warning/50 bg-status-warning/15 px-4 py-3 text-sm break-words text-foreground"
      data-testid="approval-card"
    >
      <div className="font-semibold">{approval.title}</div>
      {approval.body ? <div className="mt-1 text-muted-foreground">{approval.body}</div> : null}
      {approval.command ? (
        <pre className="mt-3 max-w-full overflow-x-auto rounded border border-status-warning/40 bg-background p-2 text-xs text-foreground">
          {approval.command}
        </pre>
      ) : null}
      {approval.filePath ? (
        <div className="mt-2 break-all font-mono text-xs">{approval.filePath}</div>
      ) : null}
      {approval.permission ? (
        <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap rounded border border-status-warning/40 bg-background p-2 text-xs text-foreground">
          {approval.permission}
        </pre>
      ) : null}
      {approval.question ? <div className="mt-2">{approval.question}</div> : null}
      <ApprovalControls approval={approval} submitApproval={submitApproval} />
    </section>
  );
}

function ApprovalControls({
  approval,
  submitApproval,
}: {
  approval: ApprovalRequest;
  submitApproval: SubmitApproval;
}) {
  switch (approval.kind) {
    case "user_input":
      return (
        <UserInputApproval
          questions={approval.questions}
          submitApproval={(answers, cancelled) =>
            submitApproval(approval.id, !cancelled, "", answers, cancelled)
          }
        />
      );
    case "command":
    case "file_change":
    case "permission":
      return <DecisionApproval approvalId={approval.id} submitApproval={submitApproval} />;
    case "structured_input":
      if (approval.structuredInput === null) {
        return (
          <div className="mt-3 font-medium text-status-critical">
            Approval request is missing structured input metadata.
          </div>
        );
      }
      return (
        <StructuredInputApproval
          input={approval.structuredInput}
          submitApproval={(approved, answers, cancelled) =>
            submitApproval(approval.id, approved, "", answers, cancelled)
          }
        />
      );
    default:
      return assertNever(approval.kind);
  }
}

function DecisionApproval({
  approvalId,
  submitApproval,
}: {
  approvalId: string;
  submitApproval: SubmitApproval;
}) {
  return (
    <div className="mt-3 flex gap-2">
      <Button
        onClick={() => void submitApproval(approvalId, true, "", [], false)}
        variant="primary"
      >
        <Check className="h-4 w-4" />
        Approve
      </Button>
      <Button
        onClick={() => void submitApproval(approvalId, false, "", [], false)}
        variant="secondary"
      >
        <X className="h-4 w-4" />
        Deny
      </Button>
    </div>
  );
}

function UserInputApproval({
  questions,
  submitApproval,
}: {
  questions: ApprovalQuestion[];
  submitApproval: (answers: ApprovalAnswer[], cancelled: boolean) => Promise<void>;
}) {
  const [answersByQuestion, setAnswersByQuestion] = useState<Record<string, string>>({});
  if (questions.length === 0) {
    return (
      <div className="mt-3 font-medium text-status-critical">
        Approval request is missing questions.
      </div>
    );
  }
  const complete = questions.every(
    (question) => answerValue(answersByQuestion, question.id) !== "",
  );
  const answers = questions.map((question) => ({
    answers: [answerValue(answersByQuestion, question.id)],
    questionId: question.id,
    value: null,
  }));

  return (
    <div className="mt-3 space-y-3">
      {questions.map((question) => {
        const answer = answerValue(answersByQuestion, question.id);
        return (
          <div className="space-y-2" key={question.id}>
            {question.header ? <div className="font-medium">{question.header}</div> : null}
            <div>{question.question}</div>
            {question.options.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {question.options.map((option) => (
                  <Button
                    key={option}
                    onClick={() => setQuestionAnswer(setAnswersByQuestion, question.id, option)}
                    type="button"
                    variant={answer === option ? "primary" : "secondary"}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            ) : null}
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
              onChange={(event) =>
                setQuestionAnswer(setAnswersByQuestion, question.id, event.target.value)
              }
              type={question.isSecret ? "password" : "text"}
              value={answer}
            />
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button
          disabled={!complete}
          onClick={() => void submitApproval(answers, false)}
          type="button"
          variant="primary"
        >
          <Check className="h-4 w-4" />
          Answer
        </Button>
        <Button onClick={() => void submitApproval([], true)} type="button" variant="secondary">
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

function answerValue(answersByQuestion: Record<string, string>, questionID: string) {
  return answersByQuestion[questionID]?.trim() ?? "";
}

function setQuestionAnswer(
  setAnswersByQuestion: (next: (current: Record<string, string>) => Record<string, string>) => void,
  questionID: string,
  answer: string,
) {
  setAnswersByQuestion((current) => ({ ...current, [questionID]: answer }));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled generated value: ${JSON.stringify(value)}`);
}
