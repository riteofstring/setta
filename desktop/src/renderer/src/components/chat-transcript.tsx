import type { ApprovalAnswer, ApprovalQuestion, ChatMessage, Run } from "@generated/backend";
import { ArrowDown, ChevronUp, Check, X } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import { Button } from "./ui/button";
import { MarkdownText } from "./markdown-text";

export interface ChatTranscriptProps {
  activeRun: Run | null;
  hasMoreOlder: boolean;
  loadOlder: () => Promise<void>;
  messages: ChatMessage[];
  submitApproval: (
    approvalId: string,
    approved: boolean,
    response: string,
    answers: ApprovalAnswer[],
    cancelled: boolean,
  ) => Promise<void>;
}

export function ChatTranscript({
  activeRun,
  hasMoreOlder,
  loadOlder,
  messages,
  submitApproval,
}: ChatTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    if (!pinned) {
      return;
    }
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [messages, activeRun, pinned]);

  async function loadOlderAndPreserveScroll() {
    const node = scrollRef.current;
    const previousHeight = node?.scrollHeight ?? 0;
    await loadOlder();
    requestAnimationFrame(() => {
      if (!node) {
        return;
      }
      node.scrollTop = node.scrollHeight - previousHeight + node.scrollTop;
    });
  }

  return (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
      <div
        className="h-full min-h-0 min-w-0 overflow-y-auto px-6 py-5"
        onScroll={(event) => {
          const node = event.currentTarget;
          setPinned(node.scrollHeight - node.scrollTop - node.clientHeight < 24);
        }}
        ref={scrollRef}
      >
        {hasMoreOlder ? (
          <div className="mb-5 flex justify-center">
            <Button onClick={() => void loadOlderAndPreserveScroll()} variant="secondary">
              <ChevronUp className="h-4 w-4" />
              Older
            </Button>
          </div>
        ) : null}
        <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-5">
          {messages.length === 0 ? (
            <div className="py-16 text-center text-sm text-zinc-500" data-testid="empty-chat">
              Start a conversation for this workspace.
            </div>
          ) : null}
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} />
          ))}
          {activeRun?.hasPendingApproval ? (
            <ApprovalCard
              key={activeRun.pendingApproval.id}
              run={activeRun}
              submitApproval={submitApproval}
            />
          ) : null}
        </div>
      </div>
      {!pinned ? (
        <Button
          aria-label="Jump to latest"
          className="absolute bottom-4 right-6 shadow-sm"
          onClick={() => {
            const node = scrollRef.current;
            if (!node) {
              return;
            }
            node.scrollTop = node.scrollHeight;
            setPinned(true);
          }}
          variant="secondary"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

const MessageRow = memo(function MessageRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const text = message.parts.map((part) => part.text).join("");
  return (
    <article
      className={isUser ? "flex min-w-0 justify-end" : "flex min-w-0 justify-start"}
      data-testid="chat-message"
    >
      <div
        className={
          isUser
            ? "max-w-[78%] overflow-hidden rounded-md bg-zinc-900 px-4 py-3 text-sm leading-6 break-words text-white"
            : "max-w-[84%] min-w-0 overflow-hidden rounded-md border border-zinc-200 bg-white px-4 py-3"
        }
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{text}</div>
        ) : (
          <MarkdownText text={text || (message.status === "streaming" ? "..." : "")} />
        )}
        {message.status === "error" || message.status === "cancelled" ? (
          <div className="mt-3 text-xs font-medium text-red-600">{message.status}</div>
        ) : null}
      </div>
    </article>
  );
});

function ApprovalCard({
  run,
  submitApproval,
}: {
  run: Run;
  submitApproval: (
    approvalId: string,
    approved: boolean,
    response: string,
    answers: ApprovalAnswer[],
    cancelled: boolean,
  ) => Promise<void>;
}) {
  const approval = run.pendingApproval;
  const isUserInput = approval.kind === "user_input";
  const questions = approval.questions.length > 0 ? approval.questions : legacyQuestion(approval);
  return (
    <section
      className="min-w-0 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm break-words text-amber-950"
      data-testid="approval-card"
    >
      <div className="font-semibold">{approval.title}</div>
      {approval.body ? <div className="mt-1 text-amber-900">{approval.body}</div> : null}
      {approval.command ? (
        <pre className="mt-3 max-w-full overflow-x-auto rounded border border-amber-200 bg-white p-2 text-xs">
          {approval.command}
        </pre>
      ) : null}
      {approval.filePath ? (
        <div className="mt-2 break-all font-mono text-xs">{approval.filePath}</div>
      ) : null}
      {approval.permission ? (
        <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap rounded border border-amber-200 bg-white p-2 text-xs">
          {approval.permission}
        </pre>
      ) : null}
      {approval.question ? <div className="mt-2">{approval.question}</div> : null}
      {isUserInput ? (
        <UserInputApproval
          questions={questions}
          submitApproval={(answers, cancelled) =>
            submitApproval(approval.id, !cancelled, "", answers, cancelled)
          }
        />
      ) : (
        <DecisionApproval approvalId={approval.id} submitApproval={submitApproval} />
      )}
    </section>
  );
}

function DecisionApproval({
  approvalId,
  submitApproval,
}: {
  approvalId: string;
  submitApproval: (
    approvalId: string,
    approved: boolean,
    response: string,
    answers: ApprovalAnswer[],
    cancelled: boolean,
  ) => Promise<void>;
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
  const complete = questions.every(
    (question) => answerValue(answersByQuestion, question.id) !== "",
  );
  const answers = questions.map((question) => ({
    answers: [answerValue(answersByQuestion, question.id)],
    questionId: question.id,
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
              className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
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

function legacyQuestion(approval: Run["pendingApproval"]): ApprovalQuestion[] {
  if (!approval.question) {
    return [];
  }
  return [
    {
      header: approval.title,
      id: "response",
      isOther: false,
      isSecret: false,
      options: approval.options,
      question: approval.question,
    },
  ];
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
