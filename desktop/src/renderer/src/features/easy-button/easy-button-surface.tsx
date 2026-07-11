import { Check, Sparkles, Square, X } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { EasyArtifact, EasyHighlight, EasyRun } from "@generated/backend";

import { MarkdownText } from "../../components/markdown-text";
import { useEasyRunStore } from "../../stores/easy-run-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { setHostPaneChromeTitle } from "../../workspace-layout/pane-title-metadata";

type EasyButtonViewState = "idle" | "working" | "complete";

// `viewState` collapses the three terminal run statuses into `complete`, which is
// all the layout and the pane title need. The tone of a terminal state is a
// different question — a stopped or failed run must never wear the success
// visuals — so the run status rides alongside it rather than inside it.
type EasyButtonStatusTone = "none" | "completed" | "failed" | "stopped";

const confirmPulseDurationMs = 1000;

export function EasyButtonSurface() {
  const controller = useEasyButtonController();
  return (
    <section
      aria-label="Easy Button"
      className="easy-button-surface"
      data-easy-button-state={controller.viewState}
      data-easy-button-status={controller.statusTone}
      data-testid="easy-button-surface"
      ref={controller.rootRef}
    >
      <HighlightRail highlights={controller.highlights} latestRun={controller.latestRun} />
      <main className="easy-button-stage">
        <div className="easy-button-center">
          <div className="easy-button-agent-chip-slot">
            <AgentChip
              activeAgentCount={controller.activeAgentCount}
              viewState={controller.viewState}
            />
          </div>
          <div className="easy-button-button-well">
            <SwirlField />
            <button
              aria-label={controller.controlLabel}
              className="easy-button-control"
              data-easy-button-confirm={controller.confirmActive ? "true" : "false"}
              data-testid="easy-button-control"
              disabled={controller.controlDisabled}
              onClick={controller.handleControlClick}
              type="button"
            >
              <ControlGlyph statusTone={controller.statusTone} viewState={controller.viewState} />
            </button>
          </div>
          <CaptionSlot
            error={controller.error}
            latestRun={controller.latestRun}
            viewState={controller.viewState}
          />
          <div className="easy-button-action-slot">
            <StopButton
              disabled={controller.stopDisabled}
              onClick={controller.handleStopClick}
              viewState={controller.viewState}
            />
          </div>
        </div>
      </main>
      <ArtifactRail artifacts={controller.artifacts} />
      <form className="easy-button-footer" onSubmit={controller.handleSubmit}>
        <div className="easy-button-input-wrap">
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
          <span aria-hidden="true" className="easy-button-enter-chip">
            ⏎
          </span>
        </div>
      </form>
    </section>
  );
}

interface EasyButtonController {
  activeAgentCount: number;
  artifacts: EasyArtifact[];
  confirmActive: boolean;
  controlDisabled: boolean;
  controlLabel: string;
  error: string | null;
  handleControlClick: () => void;
  handleInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  handleStopClick: () => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  inputDisabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  inputValue: string;
  highlights: EasyHighlight[];
  latestRun: EasyRun | null;
  rootRef: RefObject<HTMLElement | null>;
  setInputValue: (value: string) => void;
  statusTone: EasyButtonStatusTone;
  stopDisabled: boolean;
  viewState: EasyButtonViewState;
}

function useEasyButtonController(): EasyButtonController {
  const rootRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedWorkspaceId = useSelectedWorkspaceId();
  const artifacts = useEasyRunStore((state) => state.artifacts);
  const error = useEasyRunStore((state) => state.error);
  const highlights = useEasyRunStore((state) => state.highlights);
  const latestRun = useEasyRunStore((state) => state.latestRun);
  const loadSnapshot = useEasyRunStore((state) => state.loadSnapshot);
  const resetStore = useEasyRunStore((state) => state.reset);
  const start = useEasyRunStore((state) => state.start);
  const steer = useEasyRunStore((state) => state.steer);
  const stop = useEasyRunStore((state) => state.stop);
  const [inputValue, setInputValue] = useState("");
  const [pendingAction, setPendingAction] = useState(false);
  const viewState = easyButtonViewState(latestRun, pendingAction);
  const canSubmit = canSubmitRequest(selectedWorkspaceId, inputValue, latestRun, viewState);
  const submitRequest = useEasyButtonSubmit({
    canSubmit,
    inputRef,
    inputValue,
    latestRun,
    selectedWorkspaceId,
    setInputValue,
    setPendingAction,
    start,
    steer,
    viewState,
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
  });

  const statusTone = statusToneForState(viewState, latestRun);

  useEasyButtonSnapshot(selectedWorkspaceId, loadSnapshot, resetStore);
  useEasyButtonPaneTitle(rootRef, viewState);
  const confirmActive = useEasyButtonConfirmPulse(viewState, statusTone, latestRun?.id ?? null);

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
    artifacts,
    confirmActive,
    controlDisabled: controlDisabled(selectedWorkspaceId),
    controlLabel: controlAriaLabel(viewState),
    error,
    handleControlClick,
    handleInputKeyDown,
    handleStopClick: () => {
      void stopRequest();
    },
    handleSubmit,
    highlights,
    inputDisabled: inputDisabled(selectedWorkspaceId, pendingAction),
    inputRef,
    inputValue,
    latestRun,
    rootRef,
    setInputValue,
    statusTone,
    stopDisabled: pendingAction || !canStopRun(latestRun),
    viewState,
  };
}

function HighlightRail({
  highlights,
  latestRun,
}: {
  highlights: EasyHighlight[];
  latestRun: EasyRun | null;
}) {
  return (
    <aside
      aria-label="Highlights"
      className="easy-button-rail easy-button-rail-left"
      data-easy-button-rail-empty={highlights.length === 0 ? "true" : "false"}
    >
      <p className="easy-button-rail-label">Now</p>
      <ol className="easy-button-highlight-list" data-testid="easy-button-highlights">
        {highlights.map((highlight) => (
          <HighlightItem
            highlight={highlight}
            key={highlight.id}
            startedAt={latestRun?.startedAt ?? null}
          />
        ))}
      </ol>
    </aside>
  );
}

function HighlightItem({
  highlight,
  startedAt,
}: {
  highlight: EasyHighlight;
  startedAt: string | null;
}) {
  return (
    <li className="easy-button-highlight-item">
      <span aria-hidden="true" className="easy-button-highlight-dot" />
      <span className="easy-button-highlight-text">{highlight.text}</span>
      <span className="easy-button-highlight-time">
        {highlightElapsedLabel(startedAt, highlight.at)}
      </span>
    </li>
  );
}

function ArtifactRail({ artifacts }: { artifacts: EasyArtifact[] }) {
  return (
    <aside
      aria-label="Artifacts"
      className="easy-button-rail easy-button-rail-right"
      data-easy-button-rail-empty={artifacts.length === 0 ? "true" : "false"}
    >
      <p className="easy-button-rail-label">Artifacts</p>
      <div className="easy-button-artifact-stack" data-testid="easy-button-artifacts">
        {artifacts.map((artifact) => (
          <ArtifactCard artifact={artifact} key={artifact.id} />
        ))}
      </div>
    </aside>
  );
}

function ArtifactCard({ artifact }: { artifact: EasyArtifact }) {
  return (
    <article className="easy-button-artifact-card" data-artifact-kind={artifact.kind}>
      {artifact.kicker ? <p className="easy-button-artifact-kicker">{artifact.kicker}</p> : null}
      <h2 className="easy-button-artifact-title">{artifact.title}</h2>
      <ArtifactPayload artifact={artifact} />
    </article>
  );
}

function ArtifactPayload({ artifact }: { artifact: EasyArtifact }) {
  switch (artifact.kind) {
    case "markdown":
      return <MarkdownArtifact artifact={artifact} />;
    case "table":
      return <TableArtifact artifact={artifact} />;
    case "bar_chart":
      return <BarChartArtifact artifact={artifact} />;
    case "file":
      return <FileArtifact artifact={artifact} />;
  }
  const _exhaustive: never = artifact.kind;
  return _exhaustive;
}

function MarkdownArtifact({ artifact }: { artifact: EasyArtifact }) {
  const payload = requireArtifactPayload(artifact.markdown, artifact.kind);
  return (
    <div className="easy-button-artifact-markdown">
      <MarkdownText text={payload.markdown} />
    </div>
  );
}

function TableArtifact({ artifact }: { artifact: EasyArtifact }) {
  const payload = requireArtifactPayload(artifact.table, artifact.kind);
  return (
    <div className="easy-button-artifact-table-wrap">
      <table className="easy-button-artifact-table">
        <thead>
          <tr>
            {payload.columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payload.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {payload.columns.map((column, columnIndex) => (
                <td key={column.key}>{row[columnIndex] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarChartArtifact({ artifact }: { artifact: EasyArtifact }) {
  const payload = requireArtifactPayload(artifact.barChart, artifact.kind);
  const maxValue = Math.max(...payload.items.map((item) => item.value), 0);
  return (
    <div className="easy-button-artifact-bars">
      {payload.items.map((item) => (
        <div className="easy-button-artifact-bar-row" key={item.label}>
          <div className="easy-button-artifact-bar-label">{item.label}</div>
          <div className="easy-button-artifact-bar-track">
            <div className="easy-button-artifact-bar" style={barWidthStyle(item.value, maxValue)} />
            <div className="easy-button-artifact-bar-value">
              {item.value}
              {item.unit ?? ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FileArtifact({ artifact }: { artifact: EasyArtifact }) {
  const payload = requireArtifactPayload(artifact.file, artifact.kind);
  return (
    <div className="easy-button-artifact-file">
      <code>{payload.path}</code>
      {payload.description ? <p>{payload.description}</p> : null}
    </div>
  );
}

function barWidthStyle(value: number, maxValue: number): CSSProperties {
  const ratio = maxValue > 0 ? Math.max(0, Math.min(value / maxValue, 1)) : 0;
  return { width: `${Math.round(ratio * 100)}%` };
}

function requireArtifactPayload<T>(payload: T | null, kind: EasyArtifact["kind"]): T {
  if (!payload) {
    throw new Error(`Easy artifact ${kind} is missing its typed payload`);
  }
  return payload;
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

// The pulse must restart on every fresh entry into the terminal state, so it is
// keyed on the working -> complete transition rather than on the state itself.
// The run id guard keeps a failed re-submit from re-pulsing the same run, and a
// restored terminal run never pulses because it is never preceded by `working`.
// It fires only for `completed`: a pulse is a confirmation, and confirming a run
// the user cancelled — or one that failed — would contradict the summary line,
// which withholds its check mark for exactly those two statuses.
function useEasyButtonConfirmPulse(
  viewState: EasyButtonViewState,
  statusTone: EasyButtonStatusTone,
  runId: string | null,
): boolean {
  const [confirmActive, setConfirmActive] = useState(false);
  const previousViewState = useRef<EasyButtonViewState | null>(null);
  const confirmedRunId = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousViewState.current;
    previousViewState.current = viewState;
    if (viewState !== "complete") {
      setConfirmActive(false);
      return;
    }
    if (statusTone !== "completed" || previous !== "working" || !runId) {
      return;
    }
    if (confirmedRunId.current === runId) {
      return;
    }
    confirmedRunId.current = runId;
    setConfirmActive(true);
  }, [runId, statusTone, viewState]);

  // The timer keys off `confirmActive` alone. Keyed off the run instead, a run
  // swap that stays terminal (switching workspaces) would tear the timer down
  // and strand the attribute at "true".
  useEffect(() => {
    if (!confirmActive) {
      return;
    }
    const timer = window.setTimeout(() => {
      setConfirmActive(false);
    }, confirmPulseDurationMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [confirmActive]);

  return confirmActive;
}

interface SubmitOptions {
  canSubmit: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  inputValue: string;
  latestRun: EasyRun | null;
  selectedWorkspaceId: string | null;
  setInputValue: (value: string) => void;
  setPendingAction: (pending: boolean) => void;
  start: (workspaceId: string, requestText: string) => Promise<EasyRun>;
  steer: (workspaceId: string, text: string) => Promise<EasyRun>;
  viewState: EasyButtonViewState;
}

function useEasyButtonSubmit({
  canSubmit,
  inputRef,
  inputValue,
  latestRun,
  selectedWorkspaceId,
  setInputValue,
  setPendingAction,
  start,
  steer,
  viewState,
}: SubmitOptions) {
  return useCallback(async () => {
    if (!selectedWorkspaceId || !canSubmit) {
      inputRef.current?.focus();
      return;
    }
    const requestText = inputValue.trim();
    setPendingAction(true);
    try {
      if (viewState === "working" && canStopRun(latestRun)) {
        await steer(selectedWorkspaceId, requestText);
      } else {
        await start(selectedWorkspaceId, requestText);
      }
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
    latestRun,
    selectedWorkspaceId,
    setInputValue,
    setPendingAction,
    start,
    steer,
    viewState,
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
}

function useEasyButtonControlClick({ inputRef }: ControlClickOptions) {
  return useCallback(() => {
    inputRef.current?.focus();
  }, [inputRef]);
}

interface CaptionSlotProps {
  error: string | null;
  latestRun: EasyRun | null;
  viewState: EasyButtonViewState;
}

function CaptionSlot({ error, latestRun, viewState }: CaptionSlotProps) {
  return (
    <div className="easy-button-caption-slot">
      <RequestText latestRun={latestRun} viewState={viewState} />
      <p className="easy-button-helper" data-testid="easy-button-helper">
        {helperCopyForState(viewState)}
      </p>
      <SummaryText latestRun={latestRun} viewState={viewState} />
      <NarratorStatus latestRun={latestRun} />
      <ErrorText error={error} />
    </div>
  );
}

function RequestText({ latestRun, viewState }: Pick<CaptionSlotProps, "latestRun" | "viewState">) {
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
}: {
  activeAgentCount: number;
  viewState: EasyButtonViewState;
}) {
  return (
    <span className="easy-button-agent-chip" data-testid="easy-button-agent-chip">
      {viewState === "working" ? agentLabel(activeAgentCount) : ""}
    </span>
  );
}

function SummaryText({ latestRun, viewState }: Pick<CaptionSlotProps, "latestRun" | "viewState">) {
  if (viewState !== "complete" || !latestRun?.summary) {
    return null;
  }
  return (
    <p className="easy-button-summary" data-testid="easy-button-summary">
      {latestRun.status === "completed" ? (
        <>
          <span aria-hidden="true" className="easy-button-summary-ok">
            ✓
          </span>{" "}
        </>
      ) : null}
      {latestRun.summary}
    </p>
  );
}

function ErrorText({ error }: Pick<CaptionSlotProps, "error">) {
  if (!error) {
    return null;
  }
  return (
    <p className="easy-button-error" data-testid="easy-button-error">
      {error}
    </p>
  );
}

function NarratorStatus({ latestRun }: Pick<CaptionSlotProps, "latestRun">) {
  if (latestRun?.narratorStatus !== "degraded") {
    return null;
  }
  return <p className="easy-button-narrator-status">narration degraded</p>;
}

function StopButton({
  disabled,
  onClick,
  viewState,
}: {
  disabled: boolean;
  onClick: () => void;
  viewState: EasyButtonViewState;
}) {
  if (viewState !== "working") {
    return null;
  }
  return (
    <button
      aria-label="Stop easy run"
      className="easy-button-stop-button"
      data-testid="easy-button-stop-button"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Square aria-hidden="true" className="easy-button-stop-button-icon" />
      Stop
    </button>
  );
}

// The swirl is the pane's working-state indicator, and it is driven entirely by
// `data-easy-button-state` on the surface — nothing here reads the controller.
function SwirlField() {
  return (
    <div aria-hidden="true" className="easy-button-swirl">
      <div className="easy-button-swirl-inner">
        <div className="easy-button-swirl-core" />
        <div className="easy-button-swirl-layer easy-button-swirl-layer-1" />
        <div className="easy-button-swirl-layer easy-button-swirl-layer-2" />
        <div className="easy-button-swirl-layer easy-button-swirl-layer-3" />
      </div>
    </div>
  );
}

function ControlGlyph({
  statusTone,
  viewState,
}: {
  statusTone: EasyButtonStatusTone;
  viewState: EasyButtonViewState;
}) {
  switch (viewState) {
    case "complete":
      return statusTone === "failed" ? (
        <X aria-hidden="true" className="easy-button-glyph" />
      ) : (
        <Check aria-hidden="true" className="easy-button-glyph" />
      );
    // The button keeps its resting glyph while working; the swirl behind it, not
    // a glyph swap, is what says the run is live.
    case "working":
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
  latestRun: EasyRun | null,
  viewState: EasyButtonViewState,
) {
  if (!selectedWorkspaceId || !inputValue.trim()) {
    return false;
  }
  return viewState !== "working" || canStopRun(latestRun);
}

function canStopRun(latestRun: EasyRun | null): latestRun is EasyRun {
  return latestRun?.status === "working";
}

function controlDisabled(selectedWorkspaceId: string | null) {
  return !selectedWorkspaceId;
}

function inputDisabled(selectedWorkspaceId: string | null, pendingAction: boolean) {
  return !selectedWorkspaceId || pendingAction;
}

function agentLabel(activeAgentCount: number) {
  if (activeAgentCount === 1) {
    return "1 agent";
  }
  return `${activeAgentCount} agents`;
}

function easyButtonViewState(
  latestRun: EasyRun | null,
  pendingAction: boolean,
): EasyButtonViewState {
  if (latestRun?.status === "working" || pendingAction) {
    return "working";
  }
  if (
    latestRun &&
    (latestRun.status === "completed" ||
      latestRun.status === "failed" ||
      latestRun.status === "stopped")
  ) {
    return "complete";
  }
  return "idle";
}

function statusToneForState(
  viewState: EasyButtonViewState,
  latestRun: EasyRun | null,
): EasyButtonStatusTone {
  if (viewState !== "complete" || !latestRun) {
    return "none";
  }
  switch (latestRun.status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "stopped":
      return "stopped";
    case "working":
      return "none";
  }
}

function controlAriaLabel(viewState: EasyButtonViewState): string {
  switch (viewState) {
    case "working":
      return "Focus Easy Button steering input";
    case "complete":
      return "Focus Easy Button request input";
    case "idle":
      return "Focus Easy Button request input";
  }
}

function helperCopyForState(viewState: EasyButtonViewState): string {
  switch (viewState) {
    case "working":
      return "Working — Stop to cancel";
    case "complete":
      return "Type a request to start again";
    case "idle":
      return "Type a request to begin";
  }
}

function paneTitleForState(viewState: EasyButtonViewState): string {
  switch (viewState) {
    case "working":
      return "Easy Button · working";
    case "complete":
      return "Easy Button · complete";
    case "idle":
      return "Easy Button";
  }
}

function highlightElapsedLabel(startedAt: string | null, at: string): string {
  if (!startedAt) {
    return "";
  }
  const startMs = Date.parse(startedAt);
  const atMs = Date.parse(at);
  if (!Number.isFinite(startMs) || !Number.isFinite(atMs) || atMs < startMs) {
    return "";
  }
  const totalSeconds = Math.round((atMs - startMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
