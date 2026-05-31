import type { ApprovalAnswer, ApprovalQuestion, ChatMessage, Run } from "@generated/backend";
import { ArrowDown, Bot, ChevronDown, ChevronUp, Check, Copy, Wrench, X } from "lucide-react";
import type { ReactNode } from "react";
import { memo, useEffect, useRef, useState } from "react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
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
        className="h-full min-h-0 min-w-0 overflow-y-auto bg-zinc-900 px-3 py-3"
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
        <div className="flex w-full min-w-0 flex-col gap-4">
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
          className="absolute bottom-4 right-6 border-zinc-700 bg-zinc-900 text-zinc-100 shadow-sm hover:bg-zinc-800"
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
  if (message.role === "tool") {
    return <ToolMessage message={message} text={text} />;
  }
  return (
    <article
      className={
        isUser ? "flex min-w-0 flex-col items-end gap-2" : "flex min-w-0 flex-col items-start gap-2"
      }
      data-testid="chat-message"
    >
      <div
        className={
          isUser
            ? "max-w-[82%] overflow-hidden rounded-md border border-zinc-600 bg-zinc-800 px-4 py-3 text-sm leading-6 break-words text-zinc-50"
            : "max-w-[92%] min-w-0 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100"
        }
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{text}</div>
        ) : (
          <MarkdownText text={text || (message.status === "streaming" ? "..." : "")} />
        )}
        {message.status === "error" || message.status === "cancelled" ? (
          <div className="mt-3 text-xs font-medium text-zinc-400">{message.status}</div>
        ) : null}
      </div>
      <time className="text-xs text-zinc-500">{messageTime(message.createdAt)}</time>
    </article>
  );
});

function ToolMessage({ message, text }: { message: ChatMessage; text: string }) {
  return (
    <article className="min-w-0" data-testid="chat-message">
      <ToolCallFrame title="Action: tool output">
        <ToolBlock title="Result">{text || message.status}</ToolBlock>
      </ToolCallFrame>
      <time className="mt-2 block text-xs text-zinc-500">{messageTime(message.createdAt)}</time>
    </article>
  );
}

function ToolCallFrame({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-zinc-700 bg-zinc-950">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-zinc-700 px-3 py-2 text-zinc-300">
        <div className="flex min-w-0 items-center gap-3">
          <Bot className="h-4 w-4 shrink-0 text-zinc-500" />
          <span className="rounded-full border border-zinc-600 px-2 py-0.5 text-xs">1</span>
          <span className="truncate text-sm">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded bg-zinc-900 text-zinc-400"
            title="Copy tool call"
          >
            <Copy className="h-4 w-4" />
          </span>
          <ChevronDown className="h-4 w-4 text-zinc-400" aria-hidden="true" />
        </div>
      </div>
      <div className="divide-y divide-zinc-800">{children}</div>
    </div>
  );
}

function ToolBlock({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="min-w-0 px-4 py-3">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.32em] text-zinc-500">
        <Wrench className="h-3.5 w-3.5" />
        {title}
      </h4>
      <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap font-mono text-sm leading-6 text-zinc-200">
        {children}
      </pre>
    </section>
  );
}

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
    <section className="min-w-0 text-sm text-zinc-100" data-testid="approval-card">
      <ToolCallFrame title={`Action: ${approval.title}`}>
        {approval.command ? <ToolBlock title="Command">{approval.command}</ToolBlock> : null}
        {approval.filePath ? <ToolBlock title="Path">{approval.filePath}</ToolBlock> : null}
        {approval.permission ? (
          <ToolBlock title="Permission">{approval.permission}</ToolBlock>
        ) : null}
        {approval.body ? <ToolBlock title="Arguments">{approval.body}</ToolBlock> : null}
        {approval.question ? <ToolBlock title="Question">{approval.question}</ToolBlock> : null}
        <ToolBlock title="Result">Waiting for approval</ToolBlock>
      </ToolCallFrame>
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
        className="border-zinc-200 bg-zinc-100 text-zinc-950 hover:bg-white"
        onClick={() => void submitApproval(approvalId, true, "", [], false)}
        variant="primary"
      >
        <Check className="h-4 w-4" />
        Approve
      </Button>
      <Button
        className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
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
    <div className="mt-3 space-y-3 rounded-md border border-zinc-700 bg-zinc-900 p-3">
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
            <Input
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
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
          className="border-zinc-200 bg-zinc-100 text-zinc-950 hover:bg-white"
          disabled={!complete}
          onClick={() => void submitApproval(answers, false)}
          type="button"
          variant="primary"
        >
          <Check className="h-4 w-4" />
          Answer
        </Button>
        <Button
          className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
          onClick={() => void submitApproval([], true)}
          type="button"
          variant="secondary"
        >
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

function messageTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
