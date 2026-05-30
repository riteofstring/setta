import type {
  ApprovalAnswer,
  ApprovalQuestion,
  ChatMessage,
  Run,
  RunItem,
  RunItemOutput,
} from "@generated/backend";
import {
  AlertTriangle,
  ArrowDown,
  Check,
  ChevronUp,
  FileText,
  ListChecks,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import { Button } from "./ui/button";
import { MarkdownText } from "./markdown-text";

export interface ChatTranscriptProps {
  activeRun: Run | null;
  hasMoreOlder: boolean;
  loadOlder: () => Promise<void>;
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  messageIds?: string[];
  messages: ChatMessage[];
  messagesById?: Record<string, ChatMessage>;
  runItemIdsByRunId?: Record<string, string[]>;
  runItemOutputIdsByRunItemId?: Record<string, string[]>;
  runItemOutputs: RunItemOutput[];
  runItemOutputsById?: Record<string, RunItemOutput>;
  runItems: RunItem[];
  runItemsById?: Record<string, RunItem>;
  submitApproval: (
    approvalId: string,
    approved: boolean,
    response: string,
    answers: ApprovalAnswer[],
    cancelled: boolean,
  ) => Promise<void>;
}

interface TranscriptIndexes {
  messageIds: string[];
  messagesById: Record<string, ChatMessage>;
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputsById: Record<string, RunItemOutput>;
  runItemsById: Record<string, RunItem>;
}

function transcriptIndexes(props: {
  messageIds: string[] | undefined;
  messages: ChatMessage[];
  messagesById: Record<string, ChatMessage> | undefined;
  runItemIdsByRunId: Record<string, string[]> | undefined;
  runItemOutputIdsByRunItemId: Record<string, string[]> | undefined;
  runItemOutputs: RunItemOutput[];
  runItemOutputsById: Record<string, RunItemOutput> | undefined;
  runItems: RunItem[];
  runItemsById: Record<string, RunItem> | undefined;
}): TranscriptIndexes {
  return {
    ...messageIndexes(props.messages, props.messageIds, props.messagesById),
    ...runItemIndexes(props.runItems, props.runItemIdsByRunId, props.runItemsById),
    ...runItemOutputIndexes(
      props.runItemOutputs,
      props.runItemOutputIdsByRunItemId,
      props.runItemOutputsById,
    ),
  };
}

function messageIndexes(
  messages: ChatMessage[],
  messageIds: string[] | undefined,
  messagesById: Record<string, ChatMessage> | undefined,
) {
  if (messageIds && messagesById) {
    return { messageIds, messagesById };
  }
  const ordered = messages.toSorted((left, right) => left.ordinal - right.ordinal);
  const fallbackById: Record<string, ChatMessage> = {};
  for (const message of ordered) {
    fallbackById[message.id] = message;
  }
  return {
    messageIds: ordered.map((message) => message.id),
    messagesById: fallbackById,
  };
}

function runItemIndexes(
  runItems: RunItem[],
  runItemIdsByRunId: Record<string, string[]> | undefined,
  runItemsById: Record<string, RunItem> | undefined,
) {
  if (runItemIdsByRunId && runItemsById) {
    return { runItemIdsByRunId, runItemsById };
  }
  const ordered = runItems.toSorted(compareRunItems);
  const fallbackById: Record<string, RunItem> = {};
  const fallbackIdsByRunId: Record<string, string[]> = {};
  for (const item of ordered) {
    fallbackById[item.id] = item;
    fallbackIdsByRunId[item.runId] = [...(fallbackIdsByRunId[item.runId] ?? []), item.id];
  }
  return {
    runItemIdsByRunId: fallbackIdsByRunId,
    runItemsById: fallbackById,
  };
}

function runItemOutputIndexes(
  runItemOutputs: RunItemOutput[],
  runItemOutputIdsByRunItemId: Record<string, string[]> | undefined,
  runItemOutputsById: Record<string, RunItemOutput> | undefined,
) {
  if (runItemOutputIdsByRunItemId && runItemOutputsById) {
    return { runItemOutputIdsByRunItemId, runItemOutputsById };
  }
  const ordered = runItemOutputs.toSorted(compareRunItemOutputs);
  const fallbackById: Record<string, RunItemOutput> = {};
  const fallbackIdsByItemId: Record<string, string[]> = {};
  for (const output of ordered) {
    fallbackById[output.id] = output;
    fallbackIdsByItemId[output.runItemId] = [
      ...(fallbackIdsByItemId[output.runItemId] ?? []),
      output.id,
    ];
  }
  return {
    runItemOutputIdsByRunItemId: fallbackIdsByItemId,
    runItemOutputsById: fallbackById,
  };
}

function compareRunItems(left: RunItem, right: RunItem) {
  if (left.createdAt === right.createdAt) {
    return left.id.localeCompare(right.id);
  }
  return left.createdAt.localeCompare(right.createdAt);
}

function compareRunItemOutputs(left: RunItemOutput, right: RunItemOutput) {
  if (left.runItemId === right.runItemId) {
    return left.ordinal - right.ordinal;
  }
  return left.runItemId.localeCompare(right.runItemId);
}

export function ChatTranscript({
  activeRun,
  hasMoreOlder,
  loadOlder,
  loadRunItemOutput,
  messageIds,
  messages,
  messagesById,
  runItemIdsByRunId,
  runItemOutputIdsByRunItemId,
  runItemOutputs,
  runItemOutputsById,
  runItems,
  runItemsById,
  submitApproval,
}: ChatTranscriptProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const [pinned, setPinned] = useState(true);
  const transcript = useMemo(
    () =>
      transcriptIndexes({
        messageIds,
        messages,
        messagesById,
        runItemIdsByRunId,
        runItemOutputIdsByRunItemId,
        runItemOutputs,
        runItemOutputsById,
        runItems,
        runItemsById,
      }),
    [
      messageIds,
      messages,
      messagesById,
      runItemIdsByRunId,
      runItemOutputIdsByRunItemId,
      runItemOutputs,
      runItemOutputsById,
      runItems,
      runItemsById,
    ],
  );
  const firstMessage = transcript.messageIds[0]
    ? transcript.messagesById[transcript.messageIds[0]]
    : undefined;
  const firstItemIndex = firstMessage?.ordinal ?? 0;

  useEffect(() => {
    if (!pinned) {
      return;
    }
    virtuosoRef.current?.scrollToIndex({ align: "end", index: "LAST" });
  }, [
    activeRun,
    pinned,
    transcript.messageIds.length,
    transcript.runItemOutputsById,
    transcript.runItemsById,
  ]);

  async function loadOlderAndPreserveScroll() {
    await loadOlder();
  }

  if (transcript.messageIds.length === 0) {
    return (
      <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
        <div className="h-full min-h-0 min-w-0 overflow-y-auto px-6 py-5">
          <div
            className="mx-auto w-full max-w-4xl py-16 text-center text-sm text-zinc-500"
            data-testid="empty-chat"
          >
            Start a conversation for this workspace.
          </div>
          {activeRun?.hasPendingApproval ? (
            <div className="mx-auto w-full max-w-4xl">
              <ApprovalCard
                key={activeRun.pendingApproval.id}
                run={activeRun}
                submitApproval={submitApproval}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
      <Virtuoso
        atBottomStateChange={setPinned}
        className="h-full min-h-0 min-w-0 px-6 py-5"
        components={{
          Footer: () => (
            <>
              {activeRun?.hasPendingApproval ? (
                <div className="mx-auto w-full max-w-4xl py-2">
                  <ApprovalCard
                    key={activeRun.pendingApproval.id}
                    run={activeRun}
                    submitApproval={submitApproval}
                  />
                </div>
              ) : null}
            </>
          ),
          Header: () =>
            hasMoreOlder ? (
              <div className="mb-3 flex justify-center">
                <Button onClick={() => void loadOlderAndPreserveScroll()} variant="secondary">
                  <ChevronUp className="h-4 w-4" />
                  Older
                </Button>
              </div>
            ) : null,
        }}
        data={transcript.messageIds}
        firstItemIndex={firstItemIndex}
        followOutput={pinned ? "auto" : false}
        increaseViewportBy={{ bottom: 800, top: 400 }}
        initialItemCount={Math.min(transcript.messageIds.length, 30)}
        itemContent={(_, messageId) => {
          const message = transcript.messagesById[messageId];
          if (!message) {
            return null;
          }
          return (
            <MessageRow
              message={message}
              loadRunItemOutput={loadRunItemOutput}
              runItemIdsByRunId={transcript.runItemIdsByRunId}
              runItemOutputIdsByRunItemId={transcript.runItemOutputIdsByRunItemId}
              runItemOutputsById={transcript.runItemOutputsById}
              runItemsById={transcript.runItemsById}
            />
          );
        }}
        overscan={200}
        ref={virtuosoRef}
      />
      {!pinned ? (
        <Button
          aria-label="Jump to latest"
          className="absolute bottom-4 right-6 shadow-sm"
          onClick={() => {
            virtuosoRef.current?.scrollToIndex({ align: "end", index: "LAST" });
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

const MessageRow = memo(function MessageRow({
  message,
  loadRunItemOutput,
  runItemIdsByRunId,
  runItemOutputIdsByRunItemId,
  runItemOutputsById,
  runItemsById,
}: {
  message: ChatMessage;
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputsById: Record<string, RunItemOutput>;
  runItemsById: Record<string, RunItem>;
}) {
  const itemRows = activityItemsForMessage(message, runItemIdsByRunId, runItemsById);
  return (
    <article className={messageRowClass(message)} data-testid="chat-message">
      <div className={messageContainerClass(message)}>
        <MessageContent message={message} />
        <UserDeliveryBadge message={message} />
        <MessageStatus message={message} />
        {itemRows.length > 0 ? (
          <RunActivityRows
            items={itemRows}
            loadRunItemOutput={loadRunItemOutput}
            outputIdsByRunItemId={runItemOutputIdsByRunItemId}
            outputsById={runItemOutputsById}
          />
        ) : null}
      </div>
    </article>
  );
});

function messageRowClass(message: ChatMessage) {
  return message.role === "user"
    ? "mx-auto flex w-full max-w-4xl min-w-0 justify-end py-2"
    : "mx-auto flex w-full max-w-4xl min-w-0 justify-start py-2";
}

function MessageContent({ message }: { message: ChatMessage }) {
  const text = message.parts.map((part) => part.text).join("");
  if (message.role === "user") {
    return <div className="whitespace-pre-wrap">{text}</div>;
  }
  return <MarkdownText text={assistantMessageText(text, message.status)} />;
}

function assistantMessageText(text: string, status: string) {
  if (text !== "") {
    return text;
  }
  return status === "streaming" ? "..." : "";
}

function UserDeliveryBadge({ message }: { message: ChatMessage }) {
  if (message.role !== "user" || message.delivery === "normal") {
    return null;
  }
  return (
    <div className="mt-2 text-xs font-medium opacity-80">
      {message.delivery === "queued" ? "Queued" : "Steering"}
    </div>
  );
}

function MessageStatus({ message }: { message: ChatMessage }) {
  if (message.status !== "error" && message.status !== "cancelled") {
    return null;
  }
  return <div className="mt-3 text-xs font-medium text-red-600">{message.status}</div>;
}

function activityItemsForMessage(
  message: ChatMessage,
  runItemIdsByRunId: Record<string, string[]>,
  runItemsById: Record<string, RunItem>,
) {
  if (message.role === "user" || message.runId === "") {
    return [];
  }
  return (runItemIdsByRunId[message.runId] ?? [])
    .map((itemId) => runItemsById[itemId])
    .filter((item): item is RunItem => item !== undefined);
}

function messageContainerClass(message: ChatMessage) {
  if (message.role !== "user") {
    return "max-w-[84%] min-w-0 overflow-hidden rounded-md border border-zinc-200 bg-white px-4 py-3";
  }
  if (message.delivery === "queued") {
    return "max-w-[78%] overflow-hidden rounded-md border border-dashed border-zinc-300 bg-white px-4 py-3 text-sm leading-6 break-words text-zinc-800";
  }
  if (message.delivery === "steering") {
    return "max-w-[78%] overflow-hidden rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 break-words text-blue-950";
  }
  return "max-w-[78%] overflow-hidden rounded-md bg-zinc-900 px-4 py-3 text-sm leading-6 break-words text-white";
}

function RunActivityRows({
  items,
  loadRunItemOutput,
  outputIdsByRunItemId,
  outputsById,
}: {
  items: RunItem[];
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  outputIdsByRunItemId: Record<string, string[]>;
  outputsById: Record<string, RunItemOutput>;
}) {
  return (
    <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3">
      {items.map((item) => (
        <RunActivityRow
          item={item}
          key={item.id}
          loadRunItemOutput={loadRunItemOutput}
          outputs={outputsForItem(outputIdsByRunItemId, outputsById, item.id)}
        />
      ))}
    </div>
  );
}

function RunActivityRow({
  item,
  loadRunItemOutput,
  outputs,
}: {
  item: RunItem;
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  outputs: RunItemOutput[];
}) {
  const [expandedOutputLoaded, setExpandedOutputLoaded] = useState(false);
  const outputText = outputPreview(outputs);
  return (
    <details
      className="group rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
      data-testid="run-activity-row"
      onToggle={(event) => {
        if (!event.currentTarget.open || expandedOutputLoaded) {
          return;
        }
        setExpandedOutputLoaded(true);
        void loadRunItemOutput(item.runId, item.id, maxOutputOrdinal(outputs));
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <ActivityIcon type={item.type} />
        <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">
          {activityTitle(item)}
        </span>
        <span className="shrink-0 text-xs text-zinc-500">{item.status}</span>
      </summary>
      <RunActivityDetails item={item} outputText={outputText} />
    </details>
  );
}

function RunActivityDetails({ item, outputText }: { item: RunItem; outputText: string }) {
  return (
    <div className="mt-2 space-y-2 text-xs text-zinc-600">
      <RunActivityCwd cwd={item.cwd} />
      <RunActivityCommand command={item.command} />
      <RunActivityFiles paths={item.filePaths} />
      <OptionalRunActivityText value={item.progress} />
      <OptionalRunActivityText value={item.result} />
      <OptionalRunActivityText className="font-medium text-red-600" value={item.error} />
      <OptionalRunActivityText value={item.noticeMessage} />
      <OptionalRunActivityText value={item.diffSummary} />
      <RunActivityExit durationMs={item.durationMs} exitCode={item.exitCode} />
      <RunActivityOutput outputText={outputText} />
    </div>
  );
}

function RunActivityCwd({ cwd }: { cwd: string }) {
  if (!cwd) {
    return null;
  }
  return <div className="break-all font-mono">{cwd}</div>;
}

function RunActivityCommand({ command }: { command: string }) {
  if (!command) {
    return null;
  }
  return (
    <pre className="max-h-28 overflow-auto rounded border border-zinc-200 bg-white p-2">
      {command}
    </pre>
  );
}

function RunActivityFiles({ paths }: { paths: string[] }) {
  if (paths.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      {paths.map((path) => (
        <div className="break-all font-mono" key={path}>
          {path}
        </div>
      ))}
    </div>
  );
}

function OptionalRunActivityText({ className, value }: { className?: string; value: string }) {
  if (!value) {
    return null;
  }
  return <div className={className}>{value}</div>;
}

function RunActivityExit({ durationMs, exitCode }: { durationMs: number; exitCode: number }) {
  if (exitCode <= 0 && durationMs <= 0) {
    return null;
  }
  return (
    <div>
      {exitCode > 0 ? `exit ${exitCode}` : "exit 0"}
      {durationMs > 0 ? ` / ${durationMs}ms` : ""}
    </div>
  );
}

function RunActivityOutput({ outputText }: { outputText: string }) {
  if (!outputText) {
    return null;
  }
  return (
    <pre className="max-h-32 overflow-auto rounded border border-zinc-200 bg-white p-2">
      {outputText}
    </pre>
  );
}

function ActivityIcon({ type }: { type: string }) {
  if (type === "command_execution" || type === "terminal_interaction") {
    return <Terminal className="h-4 w-4 shrink-0 text-zinc-500" />;
  }
  if (type === "file_change" || type === "diff") {
    return <FileText className="h-4 w-4 shrink-0 text-zinc-500" />;
  }
  if (type === "plan" || type === "reasoning") {
    return <ListChecks className="h-4 w-4 shrink-0 text-zinc-500" />;
  }
  if (type === "notice") {
    return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />;
  }
  return <Wrench className="h-4 w-4 shrink-0 text-zinc-500" />;
}

function activityTitle(item: RunItem) {
  if (item.title) {
    return item.title;
  }
  if (item.command) {
    return item.command;
  }
  if (item.toolName) {
    return item.serverName ? `${item.serverName}.${item.toolName}` : item.toolName;
  }
  if (item.noticeKind) {
    return item.noticeKind;
  }
  if (item.summary) {
    return item.summary;
  }
  return item.type.replaceAll("_", " ");
}

function outputsForItem(
  outputIdsByRunItemId: Record<string, string[]>,
  outputsById: Record<string, RunItemOutput>,
  runItemId: string,
) {
  return (outputIdsByRunItemId[runItemId] ?? [])
    .map((outputId) => outputsById[outputId])
    .filter((output): output is RunItemOutput => output !== undefined);
}

function maxOutputOrdinal(outputs: RunItemOutput[]) {
  return outputs.reduce((max, output) => Math.max(max, output.ordinal), 0);
}

function outputPreview(outputs: RunItemOutput[]) {
  const text = outputs.map((output) => output.text).join("");
  if (text.length <= 2000) {
    return text;
  }
  return text.slice(0, 2000) + "\n...";
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
          questions={approval.questions}
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
  if (questions.length === 0) {
    return (
      <div className="mt-3 font-medium text-red-700">Approval request is missing questions.</div>
    );
  }
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
