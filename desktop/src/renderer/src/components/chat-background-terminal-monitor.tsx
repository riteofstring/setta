import type { BackgroundTerminalOutput, BackgroundTerminalProcess } from "@generated/backend";
import { CircleStop, SquareTerminal, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "../lib/utils";
import type { ChatView } from "./chat-panel";
import { BrailleSpinner } from "./ascii-spinner";
import { chatReadableColumnAttributes, chatReadableColumnPaddedClass } from "./chat-layout";
import { Button } from "./ui/button";

export function BackgroundTerminalSurface({ chat }: { chat: ChatView }) {
  const conversationId = chat.selectedConversation?.id ?? "";
  const terminals = useMemo(
    () => selectedConversationTerminals(chat, conversationId),
    [chat.backgroundTerminalIdsByConversationId, chat.backgroundTerminalsById, conversationId],
  );
  const activeTerminals = terminals.filter(isActiveTerminal);
  const [monitorOpen, setMonitorOpen] = useState(false);

  useEffect(() => {
    setMonitorOpen(false);
  }, [conversationId]);

  if (activeTerminals.length === 0 && !monitorOpen) {
    return null;
  }

  function openMonitor() {
    setMonitorOpen(true);
    void chat.refreshBackgroundTerminals();
  }

  return (
    <div className="workspace-chat-pane-surface shrink-0 border-t border-border">
      {monitorOpen ? (
        <BackgroundTerminalMonitor
          chat={chat}
          onClose={() => setMonitorOpen(false)}
          terminals={terminals}
        />
      ) : null}
      {activeTerminals.length > 0 ? (
        <BackgroundTerminalFooter terminals={activeTerminals} onOpen={openMonitor} />
      ) : null}
    </div>
  );
}

function BackgroundTerminalFooter({
  onOpen,
  terminals,
}: {
  onOpen: () => void;
  terminals: BackgroundTerminalProcess[];
}) {
  const running = terminals.some((terminal) => terminal.status === "running");
  return (
    <div {...chatReadableColumnAttributes} className={chatReadableColumnPaddedClass}>
      <button
        aria-label="Open background terminal monitor"
        className="flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
        data-active-count={terminals.length}
        data-testid="background-terminals-footer"
        onClick={onOpen}
        title="Open background terminal monitor"
        type="button"
      >
        {running ? (
          <BrailleSpinner className="text-status-success" label="Background terminal running" />
        ) : (
          <SquareTerminal className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 truncate">{backgroundTerminalFooterLabel(terminals)}</span>
      </button>
    </div>
  );
}

export function BackgroundTerminalMonitor({
  chat,
  onClose,
  terminals,
}: {
  chat: ChatView;
  onClose: () => void;
  terminals: BackgroundTerminalProcess[];
}) {
  const terminalIds = terminals.map((terminal) => terminal.id).join("\n");

  useEffect(() => {
    for (const terminal of terminals) {
      if (chat.backgroundTerminalOutputPagesByProcessId[terminal.id] !== undefined) {
        continue;
      }
      void chat.loadBackgroundTerminalOutput(terminal.id);
    }
  }, [chat, terminalIds, terminals]);

  const runningTerminals = terminals.filter((terminal) => terminal.status === "running");
  return (
    <div
      aria-label="Background terminals"
      className="max-h-[min(50vh,24rem)] min-h-0 border-b border-border"
      data-testid="background-terminal-monitor"
      role="region"
    >
      <div
        {...chatReadableColumnAttributes}
        className={cn(
          chatReadableColumnPaddedClass,
          "flex h-9 items-center gap-2 border-b border-border text-xs",
        )}
      >
        <SquareTerminal className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 truncate font-medium">Background terminals</div>
        {runningTerminals.length > 1 ? (
          <Button
            aria-label="Kill all background terminals"
            className="h-6"
            onClick={() => void chat.killAllBackgroundTerminals()}
            title="Kill all background terminals"
            variant="secondary"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Kill all</span>
          </Button>
        ) : null}
        <button
          aria-label="Close background terminal monitor"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground"
          onClick={onClose}
          title="Close background terminal monitor"
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-[calc(min(50vh,24rem)-2.25rem)] min-h-0 overflow-auto">
        {terminals.map((terminal) => (
          <BackgroundTerminalProcessRow chat={chat} key={terminal.id} terminal={terminal} />
        ))}
      </div>
    </div>
  );
}

function BackgroundTerminalProcessRow({
  chat,
  terminal,
}: {
  chat: ChatView;
  terminal: BackgroundTerminalProcess;
}) {
  const output = backgroundTerminalProcessOutput(chat, terminal);
  return (
    <div
      {...chatReadableColumnAttributes}
      className={cn(chatReadableColumnPaddedClass, "border-b border-border py-2")}
      data-command={terminal.command}
      data-process-id={terminal.id}
      data-status={terminal.status}
      data-testid="background-terminal-monitor-process"
    >
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <SquareTerminal className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-foreground">
          {terminal.command}
        </span>
        <span className={cn("shrink-0", terminalStatusClass(terminal))}>
          {backgroundTerminalStatusLabel(terminal)}
        </span>
        <Button
          aria-label={`Kill background terminal ${terminal.command}`}
          className="h-6"
          disabled={!canKillTerminal(terminal)}
          onClick={() => void chat.killBackgroundTerminal(terminal.id)}
          title={`Kill background terminal ${terminal.command}`}
          variant="secondary"
        >
          <CircleStop className="h-3.5 w-3.5" />
          <span>Kill</span>
        </Button>
      </div>
      {output.visible ? (
        <pre
          className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-sm bg-muted px-2 py-1.5 font-mono text-[11px] leading-4 text-muted-foreground"
          data-testid="background-terminal-monitor-output"
        >
          {output.text}
          {output.loadingText}
          {output.error}
        </pre>
      ) : null}
    </div>
  );
}

function backgroundTerminalProcessOutput(chat: ChatView, terminal: BackgroundTerminalProcess) {
  const outputs = backgroundTerminalOutputs(chat, terminal.id);
  const text =
    outputs.length > 0
      ? outputs.map((output) => output.text).join("")
      : terminal.recentOutput.join("\n");
  const page = chat.backgroundTerminalOutputPagesByProcessId[terminal.id];
  const error = page?.error ?? "";
  const loadingText = page?.loading ? "Loading output.\n" : "";
  return {
    error,
    loadingText,
    text,
    visible: text !== "" || loadingText !== "" || error !== "",
  };
}

function selectedConversationTerminals(chat: ChatView, conversationId: string) {
  return (chat.backgroundTerminalIdsByConversationId[conversationId] ?? [])
    .map((id) => chat.backgroundTerminalsById[id])
    .filter((terminal): terminal is BackgroundTerminalProcess => terminal !== undefined);
}

function backgroundTerminalOutputs(chat: ChatView, processId: string): BackgroundTerminalOutput[] {
  return (chat.backgroundTerminalOutputIdsByProcessId[processId] ?? [])
    .map((id) => chat.backgroundTerminalOutputsById[id])
    .filter((output): output is BackgroundTerminalOutput => output !== undefined);
}

function isActiveTerminal(terminal: BackgroundTerminalProcess) {
  return terminal.status === "running" || terminal.status === "terminating";
}

function canKillTerminal(terminal: BackgroundTerminalProcess) {
  return terminal.status === "running";
}

function backgroundTerminalFooterLabel(terminals: BackgroundTerminalProcess[]) {
  const runningCount = terminals.filter((terminal) => terminal.status === "running").length;
  const noun = terminals.length === 1 ? "background terminal" : "background terminals";
  if (runningCount === terminals.length) {
    return `${terminals.length} ${noun} running`;
  }
  if (runningCount === 0 && terminals.length === 1) {
    return "1 background terminal terminating";
  }
  return `${terminals.length} ${noun} active`;
}

function backgroundTerminalStatusLabel(terminal: BackgroundTerminalProcess) {
  switch (terminal.status) {
    case "running":
      return "running";
    case "terminating":
      return "terminating";
    case "exited":
      return terminal.exitCode === 0 ? "exited" : `exited ${terminal.exitCode}`;
    case "lost":
      return "lost";
    default:
      return assertNever(terminal.status);
  }
}

function terminalStatusClass(terminal: BackgroundTerminalProcess) {
  switch (terminal.status) {
    case "running":
      return "text-status-success";
    case "terminating":
      return "text-status-warning";
    case "exited":
      return "text-muted-foreground";
    case "lost":
      return "text-status-critical";
    default:
      return assertNever(terminal.status);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled background terminal status: ${JSON.stringify(value)}`);
}
