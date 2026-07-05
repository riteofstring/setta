import { Check, LoaderCircle, Sparkles, Square } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { EasyRun } from "@generated/backend";

import { useEasyRunStore } from "../../stores/easy-run-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { setHostPaneChromeTitle } from "../../workspace-layout/pane-title-metadata";

type EasyButtonViewState = "idle" | "working" | "complete";

export function EasyButtonSurface() {
  const controller = useEasyButtonController();
  return (
    <section
      aria-label="Easy Button"
      className="easy-button-surface"
      data-easy-button-state={controller.viewState}
      data-testid="easy-button-surface"
      ref={controller.rootRef}
    >
      <aside aria-label="Highlights" className="easy-button-rail easy-button-rail-left" />
      <main className="easy-button-stage">
        <div className="easy-button-center">
          <button
            aria-label={controller.controlLabel}
            className="easy-button-control"
            data-testid="easy-button-control"
            disabled={controller.controlDisabled}
            onClick={controller.handleControlClick}
            type="button"
          >
            <span className="easy-button-control-ring" />
            <ControlGlyph viewState={controller.viewState} />
          </button>
          <RunStatusCopy
            activeAgentCount={controller.activeAgentCount}
            error={controller.error}
            latestRun={controller.latestRun}
            viewState={controller.viewState}
          />
        </div>
        <form className="easy-button-footer" onSubmit={controller.handleSubmit}>
          <input
            aria-label="Easy Button request"
            className="easy-button-input"
            data-testid="easy-button-input"
            disabled={controller.inputDisabled}
            onChange={(event) => controller.setInputValue(event.target.value)}
            onKeyDown={controller.handleInputKeyDown}
            placeholder="What should Setta do?"
            ref={controller.inputRef}
            type="text"
            value={controller.inputValue}
          />
        </form>
      </main>
      <aside aria-label="Artifacts" className="easy-button-rail easy-button-rail-right" />
    </section>
  );
}

interface EasyButtonController {
  activeAgentCount: number;
  controlDisabled: boolean;
  controlLabel: string;
  error: string | null;
  handleControlClick: () => void;
  handleInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  inputDisabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  inputValue: string;
  latestRun: EasyRun | null;
  rootRef: RefObject<HTMLElement | null>;
  setInputValue: (value: string) => void;
  viewState: EasyButtonViewState;
}

function useEasyButtonController(): EasyButtonController {
  const rootRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedWorkspaceId = useSelectedWorkspaceId();
  const error = useEasyRunStore((state) => state.error);
  const latestRun = useEasyRunStore((state) => state.latestRun);
  const loadSnapshot = useEasyRunStore((state) => state.loadSnapshot);
  const resetStore = useEasyRunStore((state) => state.reset);
  const start = useEasyRunStore((state) => state.start);
  const stop = useEasyRunStore((state) => state.stop);
  const [dismissedRunId, setDismissedRunId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [pendingAction, setPendingAction] = useState(false);
  const viewState = easyButtonViewState(latestRun, dismissedRunId, pendingAction);
  const canSubmit = canSubmitRequest(selectedWorkspaceId, inputValue, viewState);
  const submitRequest = useEasyButtonSubmit({
    canSubmit,
    inputRef,
    inputValue,
    selectedWorkspaceId,
    setInputValue,
    setPendingAction,
    start,
  });
  const stopRequest = useEasyButtonStop({
    inputRef,
    latestRun,
    selectedWorkspaceId,
    setPendingAction,
    stop,
  });
  const handleControlClick = useEasyButtonControlClick({
    inputRef,
    latestRun,
    setDismissedRunId,
    stopRequest,
    submitRequest,
    viewState,
  });

  useEasyButtonSnapshot(selectedWorkspaceId, loadSnapshot, resetStore);
  useEasyButtonWorkingDismissalReset(latestRun, setDismissedRunId);
  useEasyButtonPaneTitle(rootRef, viewState);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submitRequest();
    },
    [submitRequest],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter" || event.shiftKey) {
        return;
      }
      event.preventDefault();
      void submitRequest();
    },
    [submitRequest],
  );

  return {
    activeAgentCount: activeAgentCountForState(viewState, latestRun),
    controlDisabled: controlDisabled(selectedWorkspaceId, pendingAction),
    controlLabel: controlAriaLabel(viewState),
    error,
    handleControlClick,
    handleInputKeyDown,
    handleSubmit,
    inputDisabled: inputDisabled(selectedWorkspaceId, pendingAction, viewState),
    inputRef,
    inputValue,
    latestRun,
    rootRef,
    setInputValue,
    viewState,
  };
}

function useEasyButtonSnapshot(
  selectedWorkspaceId: string | null,
  loadSnapshot: (workspaceId: string) => Promise<void>,
  resetStore: () => void,
) {
  useEffect(() => {
    if (!selectedWorkspaceId) {
      resetStore();
      return;
    }
    void loadSnapshot(selectedWorkspaceId);
  }, [loadSnapshot, resetStore, selectedWorkspaceId]);
}

function useEasyButtonWorkingDismissalReset(
  latestRun: EasyRun | null,
  setDismissedRunId: (runId: string | null) => void,
) {
  useEffect(() => {
    if (latestRun?.status === "working") {
      setDismissedRunId(null);
    }
  }, [latestRun?.id, latestRun?.status, setDismissedRunId]);
}

function useEasyButtonPaneTitle(
  rootRef: RefObject<HTMLElement | null>,
  viewState: EasyButtonViewState,
) {
  useEffect(() => {
    const host = rootRef.current?.closest<HTMLElement>('[data-testid="workspace-pane-host"]');
    if (!host) {
      return;
    }
    const title = paneTitleForState(viewState);
    setHostPaneChromeTitle(host, {
      fullTitle: title,
      title,
      truncation: "end",
    });
  }, [rootRef, viewState]);
}

interface SubmitOptions {
  canSubmit: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  inputValue: string;
  selectedWorkspaceId: string | null;
  setInputValue: (value: string) => void;
  setPendingAction: (pending: boolean) => void;
  start: (workspaceId: string, requestText: string) => Promise<EasyRun>;
}

function useEasyButtonSubmit({
  canSubmit,
  inputRef,
  inputValue,
  selectedWorkspaceId,
  setInputValue,
  setPendingAction,
  start,
}: SubmitOptions) {
  return useCallback(async () => {
    if (!selectedWorkspaceId || !canSubmit) {
      inputRef.current?.focus();
      return;
    }
    const requestText = inputValue.trim();
    setPendingAction(true);
    try {
      await start(selectedWorkspaceId, requestText);
      setInputValue("");
    } catch {
      inputRef.current?.focus();
    } finally {
      setPendingAction(false);
    }
  }, [
    canSubmit,
    inputRef,
    inputValue,
    selectedWorkspaceId,
    setInputValue,
    setPendingAction,
    start,
  ]);
}

interface StopOptions {
  inputRef: RefObject<HTMLInputElement | null>;
  latestRun: EasyRun | null;
  selectedWorkspaceId: string | null;
  setPendingAction: (pending: boolean) => void;
  stop: (workspaceId: string, easyRunId: string) => Promise<EasyRun>;
}

function useEasyButtonStop({
  inputRef,
  latestRun,
  selectedWorkspaceId,
  setPendingAction,
  stop,
}: StopOptions) {
  return useCallback(async () => {
    if (!selectedWorkspaceId || !canStopRun(latestRun)) {
      return;
    }
    setPendingAction(true);
    try {
      await stop(selectedWorkspaceId, latestRun.id);
    } catch {
      inputRef.current?.focus();
    } finally {
      setPendingAction(false);
    }
  }, [inputRef, latestRun, selectedWorkspaceId, setPendingAction, stop]);
}

interface ControlClickOptions {
  inputRef: RefObject<HTMLInputElement | null>;
  latestRun: EasyRun | null;
  setDismissedRunId: (runId: string | null) => void;
  stopRequest: () => Promise<void>;
  submitRequest: () => Promise<void>;
  viewState: EasyButtonViewState;
}

function useEasyButtonControlClick({
  inputRef,
  latestRun,
  setDismissedRunId,
  stopRequest,
  submitRequest,
  viewState,
}: ControlClickOptions) {
  return useCallback(() => {
    switch (viewState) {
      case "working":
        void stopRequest();
        return;
      case "complete":
        dismissRun(latestRun, setDismissedRunId, inputRef);
        return;
      case "idle":
        void submitRequest();
    }
  }, [inputRef, latestRun, setDismissedRunId, stopRequest, submitRequest, viewState]);
}

interface RunStatusCopyProps {
  activeAgentCount: number;
  error: string | null;
  latestRun: EasyRun | null;
  viewState: EasyButtonViewState;
}

function RunStatusCopy({ activeAgentCount, error, latestRun, viewState }: RunStatusCopyProps) {
  if (!shouldRenderRunStatusCopy(viewState, error)) {
    return null;
  }
  return (
    <div className="easy-button-run-copy">
      <RequestText latestRun={latestRun} viewState={viewState} />
      <AgentChip activeAgentCount={activeAgentCount} viewState={viewState} />
      <SummaryText latestRun={latestRun} viewState={viewState} />
      <ErrorText error={error} />
    </div>
  );
}

function RequestText({
  latestRun,
  viewState,
}: Pick<RunStatusCopyProps, "latestRun" | "viewState">) {
  if (!latestRun || viewState === "idle") {
    return null;
  }
  return (
    <p className="easy-button-request-text" data-testid="easy-button-request-text">
      {latestRun.requestText}
    </p>
  );
}

function AgentChip({
  activeAgentCount,
  viewState,
}: Pick<RunStatusCopyProps, "activeAgentCount" | "viewState">) {
  if (viewState !== "working") {
    return null;
  }
  return (
    <span className="easy-button-agent-chip" data-testid="easy-button-agent-chip">
      {agentLabel(activeAgentCount)}
    </span>
  );
}

function SummaryText({
  latestRun,
  viewState,
}: Pick<RunStatusCopyProps, "latestRun" | "viewState">) {
  if (viewState !== "complete" || !latestRun?.summary) {
    return null;
  }
  return (
    <p className="easy-button-summary" data-testid="easy-button-summary">
      {latestRun.summary}
    </p>
  );
}

function ErrorText({ error }: Pick<RunStatusCopyProps, "error">) {
  if (!error) {
    return null;
  }
  return (
    <p className="easy-button-error" data-testid="easy-button-error">
      {error}
    </p>
  );
}

function ControlGlyph({ viewState }: { viewState: EasyButtonViewState }) {
  switch (viewState) {
    case "working":
      return (
        <>
          <LoaderCircle aria-hidden="true" className="easy-button-spinner" />
          <Square aria-hidden="true" className="easy-button-glyph easy-button-glyph-stop" />
        </>
      );
    case "complete":
      return <Check aria-hidden="true" className="easy-button-glyph" />;
    case "idle":
      return <Sparkles aria-hidden="true" className="easy-button-glyph" />;
  }
}

function useSelectedWorkspaceId(): string | null {
  const session = useWorkspaceStore((state) => state.session);
  return session?.selectedWorkspaceId || null;
}

function activeAgentCountForState(viewState: EasyButtonViewState, latestRun: EasyRun | null) {
  if (viewState !== "working") {
    return 0;
  }
  return Math.max(latestRun?.activeAgentCount ?? 1, 1);
}

function canSubmitRequest(
  selectedWorkspaceId: string | null,
  inputValue: string,
  viewState: EasyButtonViewState,
) {
  return Boolean(selectedWorkspaceId && inputValue.trim() && viewState !== "working");
}

function canStopRun(latestRun: EasyRun | null): latestRun is EasyRun {
  return latestRun?.status === "working";
}

function controlDisabled(selectedWorkspaceId: string | null, pendingAction: boolean) {
  return !selectedWorkspaceId || pendingAction;
}

function inputDisabled(
  selectedWorkspaceId: string | null,
  pendingAction: boolean,
  viewState: EasyButtonViewState,
) {
  return !selectedWorkspaceId || pendingAction || viewState === "working";
}

function dismissRun(
  latestRun: EasyRun | null,
  setDismissedRunId: (runId: string | null) => void,
  inputRef: RefObject<HTMLInputElement | null>,
) {
  if (!latestRun) {
    return;
  }
  setDismissedRunId(latestRun.id);
  inputRef.current?.focus();
}

function shouldRenderRunStatusCopy(viewState: EasyButtonViewState, error: string | null) {
  return viewState !== "idle" || Boolean(error);
}

function agentLabel(activeAgentCount: number) {
  if (activeAgentCount === 1) {
    return "1 agent";
  }
  return `${activeAgentCount} agents`;
}

function easyButtonViewState(
  latestRun: EasyRun | null,
  dismissedRunId: string | null,
  pendingAction: boolean,
): EasyButtonViewState {
  if (latestRun?.status === "working" || pendingAction) {
    return "working";
  }
  if (
    latestRun &&
    latestRun.id !== dismissedRunId &&
    (latestRun.status === "completed" ||
      latestRun.status === "failed" ||
      latestRun.status === "stopped")
  ) {
    return "complete";
  }
  return "idle";
}

function controlAriaLabel(viewState: EasyButtonViewState): string {
  switch (viewState) {
    case "working":
      return "Stop easy run";
    case "complete":
      return "Reset easy button";
    case "idle":
      return "Start easy run";
  }
}

function paneTitleForState(viewState: EasyButtonViewState): string {
  switch (viewState) {
    case "working":
      return "Easy Button - working";
    case "complete":
      return "Easy Button - complete";
    case "idle":
      return "Easy Button";
  }
}
