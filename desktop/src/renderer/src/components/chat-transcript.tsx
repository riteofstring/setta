import type { ApprovalAnswer, ApprovalQuestion, ChatMessage, Run } from "@generated/backend";
import {
  AlertCircle,
  ArrowDown,
  Bot,
  ChevronDown,
  ChevronUp,
  Check,
  Copy,
  RotateCcw,
  Wrench,
  X,
} from "lucide-react";
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
        className="h-full min-h-0 min-w-0 overflow-y-auto bg-[#05080f] px-6 pt-20 pb-3"
        onScroll={(event) => {
          const node = event.currentTarget;
          setPinned(node.scrollHeight - node.scrollTop - node.clientHeight < 24);
        }}
        ref={scrollRef}
      >
        {hasMoreOlder ? (
          <div className="mb-5 flex justify-center">
            <Button
              className="border-[#2d3a57] bg-[#111723] text-[#c9d1df] hover:bg-[#182033]"
              onClick={() => void loadOlderAndPreserveScroll()}
              variant="secondary"
            >
              <ChevronUp className="h-4 w-4" />
              Older
            </Button>
          </div>
        ) : null}
        <div className="flex w-full min-w-0 flex-col gap-8">
          {messages.length === 0 ? (
            <div className="py-16 text-center text-sm text-[#6f7fa4]" data-testid="empty-chat">
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
          className="absolute right-6 bottom-28 border-[#2d3a57] bg-[#111723] text-zinc-100 shadow-sm hover:bg-[#182033]"
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
            ? "max-w-[88%] overflow-hidden rounded-xl border border-[#2755f0] bg-[#1d2b62] px-5 py-3 text-[18px] leading-7 break-words text-zinc-50"
            : "max-w-[88%] min-w-0 overflow-hidden rounded-xl border border-[#222c3d] bg-[#151a23] px-6 py-4 text-[18px] leading-8 text-[#d5d9e2]"
        }
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{text}</div>
        ) : (
          <MarkdownText text={text || (message.status === "streaming" ? "..." : "")} />
        )}
        {message.status === "error" || message.status === "cancelled" ? (
          <div className="mt-3 text-xs font-medium text-[#8190b8]">{message.status}</div>
        ) : null}
      </div>
      <time className="text-[15px] text-[#6678a5]">{messageTime(message.createdAt)}</time>
    </article>
  );
});

function ToolMessage({ message, text }: { message: ChatMessage; text: string }) {
  return (
    <article className="min-w-0" data-testid="chat-message">
      <ToolCallFrame title="tool_output">
        <ToolBlock title="Result">{text || message.status}</ToolBlock>
      </ToolCallFrame>
      <time className="mt-3 block text-[15px] text-[#6678a5]">
        {messageTime(message.createdAt)}
      </time>
    </article>
  );
}

function ToolCallFrame({ children, title }: { children: ReactNode; title: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="relative min-w-0">
      <button
        className="flex h-8 w-full min-w-0 items-center gap-3 text-left text-[17px] text-[#c6ccd8]"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Bot className="h-4 w-4 shrink-0 text-[#6e80ac]" />
        <span className="rounded-full border border-[#30405e] bg-[#111827] px-3 py-0.5 text-sm font-semibold text-[#c9d1df]">
          3
        </span>
        <span className="min-w-0 flex-1 truncate">Action: {title}</span>
        {open ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-[#9aa7c7]" />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-[#9aa7c7]" />
        )}
      </button>
      {open ? (
        <div className="mt-3 min-w-0 border border-[#263147] bg-[#0d1119]">
          <div className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)] border-b border-[#263147]">
            <div className="grid bg-[#151b27]">
              <ToolRailIcon />
              <ToolRailIcon />
              <ToolRailIcon />
            </div>
            <div className="min-w-0">
              <ToolCommandRow title={title} />
              <ToolCommandRow title={title} />
              <ToolCommandRow active title={title} />
            </div>
          </div>
          <div className="divide-y divide-[#263147]">{children}</div>
          <ToolCallActions />
        </div>
      ) : null}
    </div>
  );
}

function ToolRailIcon() {
  return (
    <div className="grid h-11 place-items-center text-[#9aa7c7]">
      <Wrench className="h-5 w-5" />
    </div>
  );
}

function ToolCommandRow({ active = false, title }: { active?: boolean; title: string }) {
  return (
    <button
      className="grid h-11 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 text-left font-mono text-lg font-semibold text-[#c7cedd] hover:bg-[#121824]"
      type="button"
    >
      <span className="truncate">{title}</span>
      <span className="flex items-center gap-3">
        {active ? (
          <>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-[#182032] text-[#9aa7c7]">
              <Copy className="h-4 w-4" />
            </span>
            <span className="font-sans text-base font-semibold text-[#f5dc57]">&lt;1s</span>
            <AlertCircle className="h-5 w-5 text-[#ff5b66]" />
            <ChevronUp className="h-5 w-5 text-[#9aa7c7]" />
          </>
        ) : (
          <ChevronDown className="h-5 w-5 text-[#9aa7c7]" />
        )}
      </span>
    </button>
  );
}

function ToolCallActions() {
  return (
    <div className="absolute top-[10.5rem] right-4 flex w-12 flex-col items-center rounded-lg border border-[#263147] bg-[#070b13] py-2 text-[#9aa7c7]">
      <button
        aria-label="Copy tool call"
        className="grid h-9 w-9 place-items-center rounded hover:bg-[#151b27]"
        type="button"
      >
        <Copy className="h-4 w-4" />
      </button>
      <button
        aria-label="Rerun tool call"
        className="grid h-9 w-9 place-items-center rounded hover:bg-[#151b27]"
        type="button"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
    </div>
  );
}

function ToolBlock({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="min-w-0 px-5 py-3">
      <h4 className="text-base font-bold tracking-[0.32em] text-[#9ba8c6] uppercase">{title}</h4>
      <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap font-mono text-lg leading-8 text-[#cbd2df]">
        {renderToolBlockContent(children)}
      </pre>
    </section>
  );
}

function renderToolBlockContent(children: ReactNode) {
  if (typeof children !== "string") {
    return children;
  }
  const json = formatJson(children);
  if (!json) {
    return children;
  }
  return json.map((part, index) => {
    if (part.kind === "plain") {
      return part.text;
    }
    return (
      <span className={part.kind === "key" ? "text-[#d6a7ff]" : "text-[#8ed2ff]"} key={index}>
        {part.text}
      </span>
    );
  });
}

type JsonPart = { kind: "key" | "plain" | "value"; text: string };

function formatJson(input: string): JsonPart[] | null {
  try {
    const formatted = JSON.stringify(JSON.parse(input), null, 2);
    const parts: JsonPart[] = [];
    const tokenPattern = /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|(\b\d+(?:\.\d+)?\b)/g;
    let cursor = 0;
    for (const match of formatted.matchAll(tokenPattern)) {
      if (match.index === undefined) {
        continue;
      }
      if (match.index > cursor) {
        parts.push({ kind: "plain", text: formatted.slice(cursor, match.index) });
      }
      parts.push({
        kind: match[1] ? "key" : "value",
        text: match[0],
      });
      cursor = match.index + match[0].length;
    }
    if (cursor < formatted.length) {
      parts.push({ kind: "plain", text: formatted.slice(cursor) });
    }
    return parts;
  } catch {
    return null;
  }
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
      <ToolCallFrame title={approval.title}>
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
