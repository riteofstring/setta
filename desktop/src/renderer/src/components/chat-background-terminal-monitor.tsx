import type { BackgroundTerminalOutput, BackgroundTerminalProcess } from "@generated/backend";
import { AlertTriangle, Check, CircleStop, SquareTerminal, Trash2, X } from "lucide-react";
import type { Dispatch, FocusEvent, MutableRefObject, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../lib/utils";
import type { ChatView } from "./chat-panel";
import { BrailleSpinner } from "./ascii-spinner";
import { chatReadableColumnAttributes, chatReadableColumnPaddedClass } from "./chat-layout";
import { Button } from "./ui/button";

const backgroundTerminalCompletionDwellMs = 2500;

type BackgroundTerminalSurfacePhase = "active" | "complete" | "attention";

export interface BackgroundTerminalSurfaceModel {
  conversationId: string;
  phase: BackgroundTerminalSurfacePhase;
  terminalIds: string[];
}

interface BackgroundTerminalInteractionState {
  focused: boolean;
  hovered: boolean;
  monitorOpen: boolean;
}

interface BackgroundTerminalSurfaceState {
  closeMonitor: () => void;
  dismissAttentionTerminals: () => void;
  handleBlur: (event: FocusEvent<HTMLDivElement>) => void;
  handleFocus: () => void;
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
  monitorOpen: boolean;
  monitorTerminals: BackgroundTerminalProcess[];
  openMonitor: () => void;
  surfaceModel: BackgroundTerminalSurfaceModel | null;
  terminals: BackgroundTerminalProcess[];
}

export interface BackgroundTerminalSurfaceOptions {
  showCompletedExitsFromOpenMonitor?: boolean;
}

export function BackgroundTerminalSurface({ chat }: { chat: ChatView }) {
  const state = useBackgroundTerminalSurfaceState(chat);
  if (!backgroundTerminalSurfaceShouldRender(state)) {
    return null;
  }
  return <BackgroundTerminalSurfaceContent chat={chat} state={state} />;
}

function useBackgroundTerminalSurfaceState(chat: ChatView): BackgroundTerminalSurfaceState {
  const conversationId = chat.selectedConversation?.id ?? "";
  const terminals = useMemo(
    () => selectedConversationTerminals(chat, conversationId),
    [chat.backgroundTerminalIdsByConversationId, chat.backgroundTerminalsById, conversationId],
  );
  const terminalStateKey = backgroundTerminalStateKey(terminals);
  const [surfaceModel, setSurfaceModel] = useState<BackgroundTerminalSurfaceModel | null>(() =>
    nextBackgroundTerminalSurfaceModel(null, conversationId, terminals),
  );
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissedTerminalIds, setDismissedTerminalIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [completionDwellElapsed, setCompletionDwellElapsed] = useState(false);
  const selectedSurfaceModel = selectedConversationBackgroundTerminalSurfaceModel(
    surfaceModel,
    conversationId,
  );
  const monitorOpenForSelectedConversation = monitorOpen && selectedSurfaceModel !== null;
  const surfaceKey = backgroundTerminalSurfaceKey(selectedSurfaceModel);
  const canDismissCompletedTerminals = canDismissCompletedBackgroundTerminals({
    focused,
    hovered,
    monitorOpen: monitorOpenForSelectedConversation,
  });
  const refreshBackgroundTerminals = chat.refreshBackgroundTerminals;
  const canDismissCompletedTerminalsRef = useLatestBackgroundTerminalDismissalPermission(
    canDismissCompletedTerminals,
  );

  useResetBackgroundTerminalSurface(conversationId, {
    setDismissedTerminalIds,
    setFocused,
    setHovered,
    setMonitorOpen,
  });
  useSyncBackgroundTerminalSurfaceModel({
    conversationId,
    dismissedTerminalIds,
    monitorOpen: monitorOpenForSelectedConversation,
    setSurfaceModel,
    terminalStateKey,
    terminals,
  });
  useResetBackgroundTerminalCompletionDwell(surfaceKey, setCompletionDwellElapsed);
  useRunSettledBackgroundTerminalRefresh({
    activeRun: chat.activeRun,
    conversationId,
    refreshBackgroundTerminals,
    surfaceKey,
    surfacePhase: selectedSurfaceModel?.phase ?? null,
  });
  useCompletedBackgroundTerminalDwell({
    canDismissCompletedTerminalsRef,
    setCompletionDwellElapsed,
    setSurfaceModel,
    surfaceModel: selectedSurfaceModel,
  });
  useDeferredCompletedBackgroundTerminalDismissal({
    canDismissCompletedTerminals,
    completionDwellElapsed,
    setSurfaceModel,
    surfaceModel: selectedSurfaceModel,
  });

  function openMonitor() {
    setMonitorOpen(true);
    void refreshBackgroundTerminals();
  }

  function closeMonitor() {
    setMonitorOpen(false);
    setDismissedTerminalIds((current) => addDismissedBackgroundTerminalIds(current, terminals));
    void refreshBackgroundTerminals();
  }

  function dismissAttentionTerminals() {
    if (selectedSurfaceModel === null || selectedSurfaceModel.phase !== "attention") {
      return;
    }
    setDismissedTerminalIds((current) =>
      addTerminalIdsToSet(current, selectedSurfaceModel.terminalIds),
    );
  }

  return {
    closeMonitor,
    dismissAttentionTerminals,
    handleBlur: (event) => {
      if (backgroundTerminalSurfaceLostFocus(event)) {
        setFocused(false);
      }
    },
    handleFocus: () => setFocused(true),
    handleMouseEnter: () => setHovered(true),
    handleMouseLeave: () => setHovered(false),
    monitorOpen: monitorOpenForSelectedConversation,
    monitorTerminals: monitorVisibleTerminals(terminals, dismissedTerminalIds),
    openMonitor,
    surfaceModel: selectedSurfaceModel,
    terminals,
  };
}

function BackgroundTerminalSurfaceContent({
  chat,
  state,
}: {
  chat: ChatView;
  state: BackgroundTerminalSurfaceState;
}) {
  return (
    <div
      className="workspace-chat-pane-surface shrink-0 border-t border-border"
      data-terminal-surface-state={state.surfaceModel?.phase ?? ""}
      onBlurCapture={state.handleBlur}
      onFocusCapture={state.handleFocus}
      onMouseEnter={state.handleMouseEnter}
      onMouseLeave={state.handleMouseLeave}
    >
      {backgroundTerminalMonitorElement(chat, state)}
      {backgroundTerminalFooterElement(state)}
    </div>
  );
}

function backgroundTerminalMonitorElement(chat: ChatView, state: BackgroundTerminalSurfaceState) {
  if (!state.monitorOpen) {
    return null;
  }
  return (
    <BackgroundTerminalMonitor
      chat={chat}
      onClose={state.closeMonitor}
      terminals={state.monitorTerminals}
    />
  );
}

function backgroundTerminalFooterElement(state: BackgroundTerminalSurfaceState) {
  if (state.surfaceModel === null) {
    return null;
  }
  return (
    <BackgroundTerminalFooter
      onDismiss={backgroundTerminalAttentionDismissAction(state)}
      onOpen={state.openMonitor}
      phase={state.surfaceModel.phase}
      terminals={backgroundTerminalSurfaceModelTerminals(state.surfaceModel, state.terminals)}
    />
  );
}

function backgroundTerminalAttentionDismissAction(state: BackgroundTerminalSurfaceState) {
  if (state.surfaceModel?.phase !== "attention") {
    return undefined;
  }
  return state.dismissAttentionTerminals;
}

function backgroundTerminalSurfaceShouldRender(state: BackgroundTerminalSurfaceState) {
  return state.surfaceModel !== null || state.monitorOpen;
}

function selectedConversationBackgroundTerminalSurfaceModel(
  model: BackgroundTerminalSurfaceModel | null,
  conversationId: string,
) {
  if (model?.conversationId !== conversationId) {
    return null;
  }
  return model;
}

function useResetBackgroundTerminalSurface(
  conversationId: string,
  {
    setDismissedTerminalIds,
    setFocused,
    setHovered,
    setMonitorOpen,
  }: {
    setDismissedTerminalIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
    setFocused: Dispatch<SetStateAction<boolean>>;
    setHovered: Dispatch<SetStateAction<boolean>>;
    setMonitorOpen: Dispatch<SetStateAction<boolean>>;
  },
) {
  useEffect(() => {
    setMonitorOpen(false);
    setHovered(false);
    setFocused(false);
    setDismissedTerminalIds(new Set());
  }, [conversationId, setDismissedTerminalIds, setFocused, setHovered, setMonitorOpen]);
}

function useSyncBackgroundTerminalSurfaceModel({
  conversationId,
  dismissedTerminalIds,
  monitorOpen,
  setSurfaceModel,
  terminalStateKey,
  terminals,
}: {
  conversationId: string;
  dismissedTerminalIds: ReadonlySet<string>;
  monitorOpen: boolean;
  setSurfaceModel: Dispatch<SetStateAction<BackgroundTerminalSurfaceModel | null>>;
  terminalStateKey: string;
  terminals: BackgroundTerminalProcess[];
}) {
  useEffect(() => {
    setSurfaceModel((current) =>
      nextBackgroundTerminalSurfaceModel(current, conversationId, terminals, dismissedTerminalIds, {
        showCompletedExitsFromOpenMonitor: monitorOpen,
      }),
    );
  }, [
    conversationId,
    dismissedTerminalIds,
    monitorOpen,
    setSurfaceModel,
    terminalStateKey,
    terminals,
  ]);
}

function useResetBackgroundTerminalCompletionDwell(
  surfaceKey: string,
  setCompletionDwellElapsed: Dispatch<SetStateAction<boolean>>,
) {
  useEffect(() => {
    setCompletionDwellElapsed(false);
  }, [setCompletionDwellElapsed, surfaceKey]);
}

function useLatestBackgroundTerminalDismissalPermission(canDismissCompletedTerminals: boolean) {
  const canDismissCompletedTerminalsRef = useRef(canDismissCompletedTerminals);
  useEffect(() => {
    canDismissCompletedTerminalsRef.current = canDismissCompletedTerminals;
  }, [canDismissCompletedTerminals]);
  return canDismissCompletedTerminalsRef;
}

function useRunSettledBackgroundTerminalRefresh({
  activeRun,
  conversationId,
  refreshBackgroundTerminals,
  surfaceKey,
  surfacePhase,
}: {
  activeRun: ChatView["activeRun"];
  conversationId: string;
  refreshBackgroundTerminals: ChatView["refreshBackgroundTerminals"];
  surfaceKey: string;
  surfacePhase: BackgroundTerminalSurfacePhase | null;
}) {
  const runSettledRefreshKeyRef = useRef("");
  useEffect(() => {
    if (surfacePhase !== "active") {
      return;
    }
    if (activeRun !== null) {
      return;
    }
    const refreshKey = `${conversationId}:${surfaceKey}`;
    if (runSettledRefreshKeyRef.current === refreshKey) {
      return;
    }
    runSettledRefreshKeyRef.current = refreshKey;
    void refreshBackgroundTerminals();
  }, [activeRun, conversationId, refreshBackgroundTerminals, surfaceKey, surfacePhase]);
}

function useCompletedBackgroundTerminalDwell({
  canDismissCompletedTerminalsRef,
  setCompletionDwellElapsed,
  setSurfaceModel,
  surfaceModel,
}: {
  canDismissCompletedTerminalsRef: MutableRefObject<boolean>;
  setCompletionDwellElapsed: Dispatch<SetStateAction<boolean>>;
  setSurfaceModel: Dispatch<SetStateAction<BackgroundTerminalSurfaceModel | null>>;
  surfaceModel: BackgroundTerminalSurfaceModel | null;
}) {
  useEffect(() => {
    if (surfaceModel?.phase !== "complete") {
      return;
    }
    const terminalsToDismiss = surfaceModel;
    const timeout = window.setTimeout(() => {
      if (!canDismissCompletedTerminalsRef.current) {
        setCompletionDwellElapsed(true);
        return;
      }
      dismissMatchingBackgroundTerminalSurface(setSurfaceModel, terminalsToDismiss);
    }, backgroundTerminalCompletionDwellMs);
    return () => window.clearTimeout(timeout);
  }, [canDismissCompletedTerminalsRef, setCompletionDwellElapsed, setSurfaceModel, surfaceModel]);
}

function useDeferredCompletedBackgroundTerminalDismissal({
  canDismissCompletedTerminals,
  completionDwellElapsed,
  setSurfaceModel,
  surfaceModel,
}: {
  canDismissCompletedTerminals: boolean;
  completionDwellElapsed: boolean;
  setSurfaceModel: Dispatch<SetStateAction<BackgroundTerminalSurfaceModel | null>>;
  surfaceModel: BackgroundTerminalSurfaceModel | null;
}) {
  useEffect(() => {
    const terminalsToDismiss = completedBackgroundTerminalSurfaceAfterInteraction(
      completionDwellElapsed,
      surfaceModel,
      canDismissCompletedTerminals,
    );
    if (terminalsToDismiss === null) {
      return;
    }
    dismissMatchingBackgroundTerminalSurface(setSurfaceModel, terminalsToDismiss);
  }, [canDismissCompletedTerminals, completionDwellElapsed, setSurfaceModel, surfaceModel]);
}

function completedBackgroundTerminalSurfaceAfterInteraction(
  completionDwellElapsed: boolean,
  surfaceModel: BackgroundTerminalSurfaceModel | null,
  canDismissCompletedTerminals: boolean,
): BackgroundTerminalSurfaceModel | null {
  if (!completionDwellElapsed || !canDismissCompletedTerminals) {
    return null;
  }
  if (surfaceModel?.phase !== "complete") {
    return null;
  }
  return surfaceModel;
}

function dismissMatchingBackgroundTerminalSurface(
  setSurfaceModel: Dispatch<SetStateAction<BackgroundTerminalSurfaceModel | null>>,
  expected: BackgroundTerminalSurfaceModel,
) {
  setSurfaceModel((current) => (sameBackgroundTerminalSurface(current, expected) ? null : current));
}

function backgroundTerminalSurfaceLostFocus(event: FocusEvent<HTMLDivElement>) {
  return event.relatedTarget === null || !event.currentTarget.contains(event.relatedTarget as Node);
}

function BackgroundTerminalFooter({
  onDismiss,
  onOpen,
  phase,
  terminals,
}: {
  onDismiss?: () => void;
  onOpen: () => void;
  phase: BackgroundTerminalSurfacePhase;
  terminals: BackgroundTerminalProcess[];
}) {
  const activeCount = terminals.filter(isActiveTerminal).length;
  return (
    <div {...chatReadableColumnAttributes} className={chatReadableColumnPaddedClass}>
      <div className="flex h-8 min-w-0 items-center gap-1">
        <button
          aria-label="Open background terminal monitor"
          className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
          data-active-count={activeCount}
          data-terminal-count={terminals.length}
          data-terminal-surface-state={phase}
          data-testid="background-terminals-footer"
          onClick={onOpen}
          title="Open background terminal monitor"
          type="button"
        >
          <BackgroundTerminalFooterIcon phase={phase} terminals={terminals} />
          <span className="min-w-0 truncate">
            {backgroundTerminalFooterLabel(terminals, phase)}
          </span>
        </button>
        {onDismiss ? (
          <button
            aria-label="Dismiss background terminal status"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground"
            onClick={onDismiss}
            title="Dismiss background terminal status"
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
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

function isSuccessfulExitedTerminal(terminal: BackgroundTerminalProcess) {
  return terminal.status === "exited" && terminal.exitCode === 0;
}

function isAttentionTerminal(terminal: BackgroundTerminalProcess) {
  return terminal.status === "lost" || (terminal.status === "exited" && terminal.exitCode !== 0);
}

function canKillTerminal(terminal: BackgroundTerminalProcess) {
  return terminal.status === "running";
}

function BackgroundTerminalFooterIcon({
  phase,
  terminals,
}: {
  phase: BackgroundTerminalSurfacePhase;
  terminals: BackgroundTerminalProcess[];
}) {
  switch (phase) {
    case "active":
      if (terminals.some((terminal) => terminal.status === "running")) {
        return (
          <BrailleSpinner className="text-status-success" label="Background terminal running" />
        );
      }
      return <SquareTerminal className="h-4 w-4 shrink-0 text-muted-foreground" />;
    case "complete":
      return <Check className="h-4 w-4 shrink-0 text-status-success" aria-hidden="true" />;
    case "attention":
      return <AlertTriangle className="h-4 w-4 shrink-0 text-status-critical" aria-hidden="true" />;
    default:
      return assertNever(phase);
  }
}

function backgroundTerminalFooterLabel(
  terminals: BackgroundTerminalProcess[],
  phase: BackgroundTerminalSurfacePhase,
) {
  switch (phase) {
    case "active":
      return backgroundTerminalActiveFooterLabel(terminals);
    case "complete":
      return backgroundTerminalCompleteFooterLabel(terminals.length);
    case "attention":
      return backgroundTerminalAttentionFooterLabel(terminals.length);
    default:
      return assertNever(phase);
  }
}

function backgroundTerminalActiveFooterLabel(terminals: BackgroundTerminalProcess[]) {
  const runningCount = terminals.filter((terminal) => terminal.status === "running").length;
  const activeCount = terminals.filter(isActiveTerminal).length;
  const attentionCount = terminals.filter(isAttentionTerminal).length;
  const noun = activeCount === 1 ? "background terminal" : "background terminals";
  if (attentionCount > 0 && activeCount > 0) {
    return `${activeCount} ${noun} active, ${attentionCount} need attention`;
  }
  if (runningCount === activeCount) {
    return `${activeCount} ${noun} running`;
  }
  if (runningCount === 0 && activeCount === 1) {
    return "1 background terminal terminating";
  }
  return `${activeCount} ${noun} active`;
}

function backgroundTerminalCompleteFooterLabel(count: number) {
  const noun = count === 1 ? "background terminal" : "background terminals";
  return `${count} ${noun} completed`;
}

function backgroundTerminalAttentionFooterLabel(count: number) {
  const noun = count === 1 ? "background terminal needs" : "background terminals need";
  return `${count} ${noun} attention`;
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

export function nextBackgroundTerminalSurfaceModel(
  current: BackgroundTerminalSurfaceModel | null,
  selectedConversationId: string,
  terminals: BackgroundTerminalProcess[],
  dismissedTerminalIds: ReadonlySet<string> = new Set(),
  options: BackgroundTerminalSurfaceOptions = {},
): BackgroundTerminalSurfaceModel | null {
  if (selectedConversationId === "") {
    return null;
  }
  const context = backgroundTerminalSurfaceModelContext(
    current,
    selectedConversationId,
    terminals,
    dismissedTerminalIds,
    options,
  );
  const activeSurface = activeBackgroundTerminalSurfaceModel(context);
  if (activeSurface !== null) {
    return activeSurface;
  }
  const attentionSurface = attentionBackgroundTerminalSurfaceModel(context);
  if (attentionSurface !== null) {
    return attentionSurface;
  }
  const completedSurface = completedBackgroundTerminalSurfaceModel(context);
  if (completedSurface !== null) {
    return completedSurface;
  }
  return preservedActiveBackgroundTerminalSurfaceModel(context);
}

interface BackgroundTerminalSurfaceModelContext {
  current: BackgroundTerminalSurfaceModel | null;
  currentMatchesConversation: boolean;
  options: BackgroundTerminalSurfaceOptions;
  selectedConversationId: string;
  terminalCount: number;
  terminalIds: {
    active: string[];
    attention: string[];
    successfulExit: string[];
  };
}

function backgroundTerminalSurfaceModelContext(
  current: BackgroundTerminalSurfaceModel | null,
  selectedConversationId: string,
  terminals: BackgroundTerminalProcess[],
  dismissedTerminalIds: ReadonlySet<string>,
  options: BackgroundTerminalSurfaceOptions,
): BackgroundTerminalSurfaceModelContext {
  return {
    current,
    currentMatchesConversation:
      current !== null && current.conversationId === selectedConversationId,
    options,
    selectedConversationId,
    terminalCount: terminals.length,
    terminalIds: {
      active: terminalIdsMatching(terminals, isActiveTerminal),
      attention: terminalIdsMatching(
        terminals,
        (terminal) => isAttentionTerminal(terminal) && !dismissedTerminalIds.has(terminal.id),
      ),
      successfulExit: terminalIdsMatching(terminals, isSuccessfulExitedTerminal),
    },
  };
}

function activeBackgroundTerminalSurfaceModel({
  selectedConversationId,
  terminalIds,
}: BackgroundTerminalSurfaceModelContext): BackgroundTerminalSurfaceModel | null {
  if (terminalIds.active.length === 0) {
    return null;
  }
  return {
    conversationId: selectedConversationId,
    phase: "active",
    terminalIds: [...terminalIds.active, ...terminalIds.attention],
  };
}

function attentionBackgroundTerminalSurfaceModel({
  selectedConversationId,
  terminalIds,
}: BackgroundTerminalSurfaceModelContext): BackgroundTerminalSurfaceModel | null {
  if (terminalIds.attention.length === 0) {
    return null;
  }
  return {
    conversationId: selectedConversationId,
    phase: "attention",
    terminalIds: terminalIds.attention,
  };
}

function completedBackgroundTerminalSurfaceModel(
  context: BackgroundTerminalSurfaceModelContext,
): BackgroundTerminalSurfaceModel | null {
  const existingCompletedSurface = existingCompletedBackgroundTerminalSurfaceModel(context);
  if (existingCompletedSurface !== null) {
    return existingCompletedSurface;
  }
  if (!shouldShowCompletedBackgroundTerminalSurface(context)) {
    return null;
  }
  if (context.terminalIds.successfulExit.length === 0) {
    return null;
  }
  return {
    conversationId: context.selectedConversationId,
    phase: "complete",
    terminalIds: context.terminalIds.successfulExit,
  };
}

function existingCompletedBackgroundTerminalSurfaceModel({
  current,
  currentMatchesConversation,
}: BackgroundTerminalSurfaceModelContext): BackgroundTerminalSurfaceModel | null {
  if (!currentMatchesConversation) {
    return null;
  }
  if (current?.phase !== "complete") {
    return null;
  }
  return current;
}

function shouldShowCompletedBackgroundTerminalSurface({
  current,
  currentMatchesConversation,
  options,
}: BackgroundTerminalSurfaceModelContext) {
  if (options.showCompletedExitsFromOpenMonitor === true) {
    return true;
  }
  if (!currentMatchesConversation) {
    return false;
  }
  return current?.phase === "active";
}

function preservedActiveBackgroundTerminalSurfaceModel({
  current,
  currentMatchesConversation,
  terminalCount,
}: BackgroundTerminalSurfaceModelContext): BackgroundTerminalSurfaceModel | null {
  if (!currentMatchesConversation) {
    return null;
  }
  if (current?.phase !== "active") {
    return null;
  }
  if (terminalCount > 0) {
    return null;
  }
  return current;
}

export function canDismissCompletedBackgroundTerminals(
  interaction: BackgroundTerminalInteractionState,
) {
  return !interaction.focused && !interaction.hovered && !interaction.monitorOpen;
}

function terminalIdsMatching(
  terminals: BackgroundTerminalProcess[],
  predicate: (terminal: BackgroundTerminalProcess) => boolean,
) {
  return terminals.filter(predicate).map((terminal) => terminal.id);
}

function backgroundTerminalSurfaceModelTerminals(
  model: BackgroundTerminalSurfaceModel | null,
  terminals: BackgroundTerminalProcess[],
) {
  if (model === null) {
    return [];
  }
  const byId = new Map(terminals.map((terminal) => [terminal.id, terminal]));
  return model.terminalIds
    .map((id) => byId.get(id))
    .filter((terminal): terminal is BackgroundTerminalProcess => terminal !== undefined);
}

function monitorVisibleTerminals(
  terminals: BackgroundTerminalProcess[],
  dismissedTerminalIds: ReadonlySet<string>,
) {
  return terminals.filter(
    (terminal) => isActiveTerminal(terminal) || !dismissedTerminalIds.has(terminal.id),
  );
}

function addDismissedBackgroundTerminalIds(
  current: ReadonlySet<string>,
  terminals: BackgroundTerminalProcess[],
) {
  return addTerminalIdsToSet(current, terminalIdsMatching(terminals, isAttentionTerminal));
}

function addTerminalIdsToSet(current: ReadonlySet<string>, ids: string[]) {
  if (ids.length === 0) {
    return current;
  }
  const next = new Set(current);
  for (const id of ids) {
    next.add(id);
  }
  return next;
}

function backgroundTerminalSurfaceKey(model: BackgroundTerminalSurfaceModel | null) {
  if (model === null) {
    return "";
  }
  return `${model.conversationId}:${model.phase}:${model.terminalIds.join("\n")}`;
}

function backgroundTerminalStateKey(terminals: BackgroundTerminalProcess[]) {
  return terminals
    .map(
      (terminal) =>
        `${terminal.id}:${terminal.status}:${terminal.exitCode}:${terminal.updatedAt}:${terminal.completedAt}`,
    )
    .join("\n");
}

function sameBackgroundTerminalSurface(
  current: BackgroundTerminalSurfaceModel | null,
  expected: BackgroundTerminalSurfaceModel,
) {
  return (
    current !== null &&
    current.conversationId === expected.conversationId &&
    current.phase === expected.phase &&
    current.terminalIds.length === expected.terminalIds.length &&
    current.terminalIds.every((id, index) => id === expected.terminalIds[index])
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled background terminal status: ${JSON.stringify(value)}`);
}
