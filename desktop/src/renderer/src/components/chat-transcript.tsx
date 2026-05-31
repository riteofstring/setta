import type { ApprovalAnswer, ApprovalQuestion, ChatMessage, Run } from "@generated/backend";
import {
  AlertCircle,
  ArrowDown,
  Bot,
  ChevronDown,
  ChevronUp,
  Check,
  Copy,
  Pencil,
  RotateCcw,
  Search,
  Wrench,
  X,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { MarkdownText } from "./markdown-text";

export interface ChatTranscriptProps {
  activeRun: Run | null;
  hasMoreOlder: boolean;
  loadOlder: () => Promise<void>;
  messages: ChatMessage[];
  onSearchOpenChange?: (open: boolean) => void;
  searchOpen?: boolean;
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
  onSearchOpenChange = () => {},
  searchOpen = false,
  submitApproval,
}: ChatTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messageNodeRefs = useRef(new Map<string, HTMLDivElement>());
  const [pinned, setPinned] = useState(true);
  const search = useChatSearch({
    messageNodeRefs,
    messages,
    onOpenChange: onSearchOpenChange,
    open: searchOpen,
  });

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

  function setMessageNode(messageId: string, node: HTMLDivElement | null) {
    if (node) {
      messageNodeRefs.current.set(messageId, node);
      return;
    }
    messageNodeRefs.current.delete(messageId);
  }

  return (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
      <ChatSearchBar search={search} />
      <div
        className="h-full min-h-0 min-w-0 overflow-y-auto bg-zinc-900 px-3 pt-4 pb-2"
        onScroll={(event) => {
          const node = event.currentTarget;
          setPinned(node.scrollHeight - node.scrollTop - node.clientHeight < 24);
        }}
        ref={scrollRef}
      >
        {hasMoreOlder ? (
          <div className="mb-2 flex justify-center">
            <Button
              className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
              onClick={() => void loadOlderAndPreserveScroll()}
              variant="secondary"
            >
              <ChevronUp className="h-4 w-4" />
              Older
            </Button>
          </div>
        ) : null}
        <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-3">
          {messages.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500" data-testid="empty-chat">
              Start a conversation for this workspace.
            </div>
          ) : null}
          {messages.map((message) => (
            <div
              className={cn(
                "scroll-mt-16 rounded-sm transition-shadow",
                search.activeMessageId === message.id
                  ? "bg-blue-400/5 ring-1 ring-blue-400/50"
                  : "",
              )}
              key={message.id}
              ref={(node) => setMessageNode(message.id, node)}
            >
              <MessageRow message={message} />
            </div>
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
          className="absolute right-4 bottom-20 border-zinc-700 bg-zinc-900 text-zinc-100 shadow-sm hover:bg-zinc-800"
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

interface ChatSearchController {
  activeIndex: number;
  activeMessageId: string | null;
  close: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  matchCount: number;
  next: () => void;
  open: boolean;
  previous: () => void;
  query: string;
  setQuery: (query: string) => void;
}

function useChatSearch({
  messageNodeRefs,
  messages,
  onOpenChange,
  open,
}: {
  messageNodeRefs: { current: Map<string, HTMLDivElement> };
  messages: ChatMessage[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
}): ChatSearchController {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQueryValue] = useState("");
  const matches = useMemo(() => chatSearchMatches(messages, query), [messages, query]);
  const activeMessageId = matches[activeIndex]?.messageId ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [open]);

  useEffect(() => {
    if (activeIndex < matches.length) {
      return;
    }
    setActiveIndex(Math.max(0, matches.length - 1));
  }, [activeIndex, matches.length]);

  useEffect(() => {
    if (!activeMessageId) {
      return;
    }
    messageNodeRefs.current.get(activeMessageId)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [activeMessageId, messageNodeRefs]);

  function move(direction: "next" | "previous") {
    if (matches.length === 0) {
      return;
    }
    setActiveIndex((current) => {
      const offset = direction === "next" ? 1 : -1;
      return (current + offset + matches.length) % matches.length;
    });
  }

  return {
    activeIndex,
    activeMessageId,
    close: () => onOpenChange(false),
    inputRef,
    matchCount: matches.length,
    next: () => move("next"),
    open,
    previous: () => move("previous"),
    query,
    setQuery: (nextQuery) => {
      setQueryValue(nextQuery);
      setActiveIndex(0);
    },
  };
}

function ChatSearchBar({ search }: { search: ChatSearchController }) {
  if (!search.open) {
    return null;
  }

  const resultLabel =
    search.query.trim() === ""
      ? "0/0"
      : `${search.matchCount === 0 ? 0 : search.activeIndex + 1}/${search.matchCount}`;

  return (
    <div className="pointer-events-none absolute top-2 right-3 left-3 z-20 flex justify-end">
      <div className="pointer-events-auto flex h-7 w-full max-w-xs min-w-0 items-center gap-1 rounded-sm border border-zinc-700/90 bg-zinc-800/95 px-1.5 text-zinc-100 shadow-xl shadow-black/40 backdrop-blur">
        <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
        <Input
          className="h-6 min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-xs text-zinc-100 shadow-none placeholder:text-zinc-500 focus-visible:border-0"
          onChange={(event) => search.setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              search.close();
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (event.shiftKey) {
                search.previous();
                return;
              }
              search.next();
            }
          }}
          placeholder="Search chat"
          ref={search.inputRef}
          value={search.query}
        />
        <span className="min-w-8 text-right text-[11px] text-zinc-500">{resultLabel}</span>
        <SearchNavButton
          disabled={search.matchCount === 0}
          label="Previous result"
          onClick={search.previous}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </SearchNavButton>
        <SearchNavButton
          disabled={search.matchCount === 0}
          label="Next result"
          onClick={search.next}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </SearchNavButton>
        <SearchNavButton label="Close chat search" onClick={search.close}>
          <X className="h-3.5 w-3.5" />
        </SearchNavButton>
      </div>
    </div>
  );
}

function SearchNavButton({
  children,
  disabled = false,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 disabled:pointer-events-none disabled:text-zinc-600"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

interface ChatSearchMatch {
  messageId: string;
}

function chatSearchMatches(messages: ChatMessage[], query: string): ChatSearchMatch[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === "") {
    return [];
  }
  return messages
    .filter((message) => chatMessageText(message).toLowerCase().includes(normalizedQuery))
    .map((message) => ({ messageId: message.id }));
}

function chatMessageText(message: ChatMessage) {
  return message.parts.map((part) => part.text).join("");
}

const MessageRow = memo(function MessageRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const text = chatMessageText(message);
  if (message.role === "tool") {
    return <ToolMessage message={message} text={text} />;
  }
  return (
    <article className={messageRowClass(isUser)} data-testid="chat-message">
      <div className={messageActionsRowClass(isUser)}>
        <MessageContent isUser={isUser} message={message} text={text} />
        <MessageActions messageId={message.id} text={text} />
      </div>
      <time className="text-xs text-zinc-500">{messageTime(message.createdAt)}</time>
    </article>
  );
});

function messageRowClass(isUser: boolean) {
  return cn("group flex min-w-0 flex-col gap-1", isUser && "items-end");
}

function messageActionsRowClass(isUser: boolean) {
  return cn("flex max-w-full min-w-0 items-start gap-2", isUser ? "flex-row-reverse" : "flex-row");
}

function MessageContent({
  isUser,
  message,
  text,
}: {
  isUser: boolean;
  message: ChatMessage;
  text: string;
}) {
  if (isUser) {
    return <UserMessageContent message={message} text={text} />;
  }
  return <AssistantMessageContent message={message} text={text} />;
}

function UserMessageContent({ message, text }: { message: ChatMessage; text: string }) {
  return (
    <div className="max-w-[82%] overflow-hidden rounded-sm bg-zinc-800 px-2 py-1 text-[13px] leading-5 break-words text-zinc-50">
      <div className="whitespace-pre-wrap">{text}</div>
      <MessageStatus status={message.status} />
    </div>
  );
}

function AssistantMessageContent({ message, text }: { message: ChatMessage; text: string }) {
  return (
    <div className="max-w-[88%] min-w-0 text-[13px] leading-5 text-zinc-200">
      <MarkdownText text={text || (message.status === "streaming" ? "..." : "")} />
      <MessageStatus status={message.status} />
    </div>
  );
}

function MessageStatus({ status }: { status: string }) {
  if (status !== "error" && status !== "cancelled") {
    return null;
  }
  return <div className="mt-2 text-xs font-medium text-zinc-500">{status}</div>;
}

function MessageActions({ messageId, text }: { messageId: string; text: string }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 pt-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <button
        aria-label="Copy message"
        className="grid h-6 w-6 place-items-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={() => void navigator.clipboard.writeText(text)}
        title="Copy message"
        type="button"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button
        aria-label="Edit message"
        className="grid h-6 w-6 place-items-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent("setta:edit-message", { detail: { messageId, text } }),
          );
        }}
        title="Edit message"
        type="button"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ToolMessage({ message, text }: { message: ChatMessage; text: string }) {
  return (
    <article className="min-w-0" data-testid="chat-message">
      <ToolCallFrame title="tool_output">
        <ToolBlock title="Result">{text || message.status}</ToolBlock>
      </ToolCallFrame>
      <time className="mt-1 block text-xs text-zinc-500">{messageTime(message.createdAt)}</time>
    </article>
  );
}

function ToolCallFrame({ children, title }: { children: ReactNode; title: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="relative min-w-0">
      <button
        className="flex h-6 w-full min-w-0 items-center gap-2 text-left text-xs text-zinc-300"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Bot className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
          3
        </span>
        <span className="min-w-0 flex-1 truncate">Action: {title}</span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        )}
      </button>
      {open ? (
        <div className="mt-1.5 min-w-0 border border-zinc-700 bg-zinc-950">
          <div className="grid min-w-0 grid-cols-[32px_minmax(0,1fr)] border-b border-zinc-700">
            <div className="grid bg-zinc-900">
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
          <div className="divide-y divide-zinc-700">{children}</div>
          <ToolCallActions />
        </div>
      ) : null}
    </div>
  );
}

function ToolRailIcon() {
  return (
    <div className="grid h-7 place-items-center text-zinc-400">
      <Wrench className="h-3.5 w-3.5" />
    </div>
  );
}

function ToolCommandRow({ active = false, title }: { active?: boolean; title: string }) {
  return (
    <button
      className="grid h-7 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2 text-left font-mono text-xs font-semibold text-zinc-300 hover:bg-zinc-900"
      type="button"
    >
      <span className="truncate">{title}</span>
      <span className="flex items-center gap-2">
        {active ? (
          <>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-zinc-900 text-zinc-400">
              <Copy className="h-3.5 w-3.5" />
            </span>
            <span className="font-sans text-xs font-semibold text-zinc-300">&lt;1s</span>
            <AlertCircle className="h-3.5 w-3.5 text-zinc-400" />
            <ChevronUp className="h-3.5 w-3.5 text-zinc-400" />
          </>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
        )}
      </span>
    </button>
  );
}

function ToolCallActions() {
  return (
    <div className="absolute top-[5.75rem] right-2 flex w-8 flex-col items-center rounded-sm border border-zinc-700 bg-zinc-950 py-1 text-zinc-400">
      <button
        aria-label="Copy tool call"
        className="grid h-6 w-6 place-items-center rounded hover:bg-zinc-900"
        type="button"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button
        aria-label="Rerun tool call"
        className="grid h-6 w-6 place-items-center rounded hover:bg-zinc-900"
        type="button"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ToolBlock({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="min-w-0 px-3 py-2">
      <h4 className="text-[11px] font-bold tracking-[0.32em] text-zinc-500 uppercase">{title}</h4>
      <pre className="mt-1.5 max-w-full overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-zinc-300">
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
      <span className={part.kind === "key" ? "text-zinc-200" : "text-zinc-400"} key={index}>
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
    <section className="min-w-0 text-xs text-zinc-100" data-testid="approval-card">
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
    <div className="mt-2 flex gap-1.5">
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
    <div className="mt-2 space-y-2 rounded-sm border border-zinc-700 bg-zinc-900 p-2">
      {questions.map((question) => {
        const answer = answerValue(answersByQuestion, question.id);
        return (
          <div className="space-y-1.5" key={question.id}>
            {question.header ? <div className="font-medium">{question.header}</div> : null}
            <div>{question.question}</div>
            {question.options.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
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
              className="w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-400"
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
