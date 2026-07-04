import type { Run, RunItemPlanDetails, RunItemPlanStep, TranscriptBlock } from "@generated/backend";
import { Check, ChevronDown, ChevronRight, Circle, ListChecks, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../lib/utils";
import type { ChatView } from "./chat-panel";
import { chatReadableColumnAttributes, chatReadableColumnPaddedClass } from "./chat-layout";

const currentPlanCompletionDwellMs = 1500;

interface CurrentPlanModel {
  conversationId: string;
  plan: RunItemPlanDetails;
  runId: string;
  sourceRunItemId: string;
}

interface CurrentPlanCandidate extends CurrentPlanModel {
  ordinal: number;
}

type CurrentPlanSurfacePhase = "active" | "complete";
type CurrentPlanTerminalMode = "completed" | "cancelled" | "failed";

interface CurrentPlanSurfaceModel extends CurrentPlanModel {
  phase: CurrentPlanSurfacePhase;
}

interface CurrentPlanInteractionState {
  expanded: boolean;
  focused: boolean;
  hovered: boolean;
}

export function CurrentPlanSurface({ chat }: { chat: ChatView }) {
  const selectedConversationId = chat.selectedConversation?.id ?? "";
  const activePlan = useMemo(
    () => currentPlanFromTranscript(chat.transcriptBlocks, chat.activeRun),
    [chat.activeRun, chat.transcriptBlocks],
  );
  const [surfacePlan, setSurfacePlan] = useState<CurrentPlanSurfaceModel | null>(() =>
    nextCurrentPlanSurfaceModel(null, selectedConversationId, activePlan),
  );
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [completionDwellElapsed, setCompletionDwellElapsed] = useState(false);
  const surfaceKey = currentPlanSurfaceKey(surfacePlan);
  const canDismissCompletedPlan = canDismissCompletedCurrentPlan({
    expanded,
    focused,
    hovered,
  });
  const canDismissCompletedPlanRef = useRef(canDismissCompletedPlan);

  useEffect(() => {
    setExpanded(false);
  }, [surfaceKey]);

  useEffect(() => {
    setSurfacePlan((current) => {
      const terminalMode =
        current === null ? null : terminalRunStatusModeFromRun(chat.runsById[current.runId]);
      return nextCurrentPlanSurfaceModel(current, selectedConversationId, activePlan, terminalMode);
    });
  }, [activePlan, chat.runsById, selectedConversationId]);

  useEffect(() => {
    setCompletionDwellElapsed(false);
  }, [
    surfacePlan?.conversationId,
    surfacePlan?.phase,
    surfacePlan?.runId,
    surfacePlan?.sourceRunItemId,
  ]);

  useEffect(() => {
    canDismissCompletedPlanRef.current = canDismissCompletedPlan;
  }, [canDismissCompletedPlan]);

  useEffect(() => {
    if (surfacePlan?.phase !== "complete") {
      return;
    }
    const planToDismiss = surfacePlan;
    const timeout = window.setTimeout(() => {
      if (!canDismissCompletedPlanRef.current) {
        setCompletionDwellElapsed(true);
        return;
      }
      setSurfacePlan((current) =>
        sameCurrentPlanSurface(current, planToDismiss) ? null : current,
      );
    }, currentPlanCompletionDwellMs);
    return () => window.clearTimeout(timeout);
  }, [surfacePlan]);

  useEffect(() => {
    if (!completionDwellElapsed || surfacePlan?.phase !== "complete" || !canDismissCompletedPlan) {
      return;
    }
    const planToDismiss = surfacePlan;
    setSurfacePlan((current) => (sameCurrentPlanSurface(current, planToDismiss) ? null : current));
  }, [canDismissCompletedPlan, completionDwellElapsed, surfacePlan]);

  if (surfacePlan === null) {
    return null;
  }

  const summary = currentPlanSummary(surfacePlan.plan);
  const toggleLabel = currentPlanToggleLabel(expanded, surfacePlan.phase);
  return (
    <div
      className="workspace-chat-pane-surface shrink-0 border-t border-border"
      data-current-step={summary.currentStepLabel}
      data-expanded={String(expanded)}
      data-plan-completed-count={summary.completedCount}
      data-plan-state={surfacePlan.phase}
      data-plan-step-count={surfacePlan.plan.steps.length}
      data-run-id={surfacePlan.runId}
      data-run-item-id={surfacePlan.sourceRunItemId}
      data-testid="current-plan-surface"
      onBlurCapture={(event) => {
        if (
          event.relatedTarget === null ||
          !event.currentTarget.contains(event.relatedTarget as Node)
        ) {
          setFocused(false);
        }
      }}
      onFocusCapture={() => setFocused(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {expanded ? <CurrentPlanExpanded plan={surfacePlan.plan} /> : null}
      <div
        {...chatReadableColumnAttributes}
        className={chatReadableColumnPaddedClass}
        data-testid="current-plan-footer"
      >
        <button
          aria-expanded={expanded}
          aria-label={toggleLabel}
          className="flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
          onClick={() => setExpanded((open) => !open)}
          title={toggleLabel}
          type="button"
        >
          <CurrentPlanDisclosureIcon expanded={expanded} />
          <CurrentPlanStateIcon phase={surfacePlan.phase} />
          <span className="shrink-0 font-medium text-foreground">
            {currentPlanSurfaceLabel(surfacePlan.phase)}
          </span>
          <span className="shrink-0 text-muted-foreground">{summary.progressLabel}</span>
          <span className="min-w-0 truncate text-muted-foreground">{summary.stepLabel}</span>
        </button>
      </div>
    </div>
  );
}

export function currentPlanFromTranscript(
  blocks: TranscriptBlock[],
  activeRun: Pick<NonNullable<ChatView["activeRun"]>, "conversationId" | "id"> | null,
): CurrentPlanModel | null {
  if (activeRun === null) {
    return null;
  }
  const latest = latestCurrentPlanCandidate(blocks, activeRun);
  if (latest === null) {
    return null;
  }
  return {
    conversationId: latest.conversationId,
    plan: latest.plan,
    runId: latest.runId,
    sourceRunItemId: latest.sourceRunItemId,
  };
}

function latestCurrentPlanCandidate(
  blocks: TranscriptBlock[],
  activeRun: Pick<NonNullable<ChatView["activeRun"]>, "conversationId" | "id">,
) {
  let latest: CurrentPlanCandidate | null = null;
  for (const block of blocks) {
    const candidate = currentPlanCandidate(block, activeRun);
    if (candidate === null) {
      continue;
    }
    latest = laterCurrentPlanCandidate(latest, candidate);
  }
  return latest;
}

function currentPlanCandidate(
  block: TranscriptBlock,
  activeRun: Pick<NonNullable<ChatView["activeRun"]>, "conversationId" | "id">,
): CurrentPlanCandidate | null {
  if (block.runId !== activeRun.id || block.conversationId !== activeRun.conversationId) {
    return null;
  }
  if (block.kind !== "activity_item") {
    return null;
  }
  const activity = block.activity;
  if (activity === null || activity.type !== "plan") {
    return null;
  }
  const plan = activity.details.plan;
  if (plan === null) {
    return null;
  }
  return {
    conversationId: activeRun.conversationId,
    ordinal: block.ordinal,
    plan,
    runId: activeRun.id,
    sourceRunItemId: activity.sourceRunItemId,
  };
}

function laterCurrentPlanCandidate(
  latest: CurrentPlanCandidate | null,
  candidate: CurrentPlanCandidate,
) {
  if (latest === null) {
    return candidate;
  }
  return candidate.ordinal > latest.ordinal ? candidate : latest;
}

function CurrentPlanExpanded({ plan }: { plan: RunItemPlanDetails }) {
  return (
    <div
      {...chatReadableColumnAttributes}
      className={cn(chatReadableColumnPaddedClass, "max-h-[min(38vh,18rem)] overflow-auto py-2")}
      data-testid="current-plan-expanded"
    >
      {plan.explanation ? (
        <div className="mb-2 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
          {plan.explanation}
        </div>
      ) : null}
      <ol className="space-y-1 border-l border-border pl-3" data-testid="current-plan-steps">
        {plan.steps.map((step, index) => (
          <CurrentPlanStepRow
            index={index}
            key={`${step.status}:${step.step}:${index}`}
            step={step}
          />
        ))}
      </ol>
    </div>
  );
}

function CurrentPlanStepRow({ index, step }: { index: number; step: RunItemPlanStep }) {
  return (
    <li
      className="grid min-w-0 grid-cols-[1rem_5.5rem_minmax(0,1fr)] items-start gap-2 text-xs leading-5"
      data-plan-step-index={index}
      data-plan-step-status={step.status}
    >
      <PlanStepIcon status={step.status} />
      <span className={cn("font-medium", planStepStatusClass(step.status))}>
        {planStepStatusLabel(step.status)}
      </span>
      <span className="min-w-0 break-words text-muted-foreground [overflow-wrap:anywhere]">
        {step.step}
      </span>
    </li>
  );
}

function CurrentPlanDisclosureIcon({ expanded }: { expanded: boolean }) {
  if (expanded) {
    return <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  return <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}

function CurrentPlanStateIcon({ phase }: { phase: CurrentPlanSurfacePhase }) {
  switch (phase) {
    case "active":
      return <ListChecks className="h-4 w-4 shrink-0 text-status-success" aria-hidden="true" />;
    case "complete":
      return <Check className="h-4 w-4 shrink-0 text-status-success" aria-hidden="true" />;
    default:
      return assertNever(phase);
  }
}

function PlanStepIcon({ status }: { status: RunItemPlanStep["status"] }) {
  switch (status) {
    case "completed":
      return <Check className="mt-1 h-3.5 w-3.5 text-status-success" aria-hidden="true" />;
    case "inProgress":
      return <LoaderCircle className="mt-1 h-3.5 w-3.5 text-foreground" aria-hidden="true" />;
    case "pending":
      return <Circle className="mt-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
    default:
      return assertNever(status);
  }
}

function currentPlanSummary(plan: RunItemPlanDetails) {
  const completedCount = completedPlanStepCount(plan.steps);
  const currentStep = currentPlanActiveStep(plan.steps);
  const step = currentStep ?? currentPlanFallbackStep(plan.steps);
  return {
    completedCount,
    currentStep,
    currentStepLabel: currentStep?.step ?? "",
    progressLabel: `${completedCount}/${plan.steps.length} done`,
    stepLabel: step?.step ?? "No plan steps",
  };
}

function completedPlanStepCount(steps: RunItemPlanStep[]) {
  return steps.filter((step) => step.status === "completed").length;
}

function currentPlanActiveStep(steps: RunItemPlanStep[]) {
  return steps.find((step) => step.status === "inProgress") ?? null;
}

function currentPlanFallbackStep(steps: RunItemPlanStep[]) {
  return currentPlanPendingStep(steps) ?? currentPlanLastCompletedStep(steps);
}

function currentPlanPendingStep(steps: RunItemPlanStep[]) {
  return steps.find((step) => step.status === "pending") ?? null;
}

function currentPlanLastCompletedStep(steps: RunItemPlanStep[]) {
  return steps.toReversed().find((step) => step.status === "completed") ?? null;
}

function currentPlanSurfaceKey(plan: CurrentPlanModel | null) {
  if (plan === null) {
    return "";
  }
  return `${plan.runId}:${plan.sourceRunItemId}`;
}

function currentPlanToggleLabel(expanded: boolean, phase: CurrentPlanSurfacePhase) {
  const name = phase === "complete" ? "completed plan" : "current plan";
  return expanded ? `Collapse ${name}` : `Expand ${name}`;
}

function currentPlanSurfaceLabel(phase: CurrentPlanSurfacePhase) {
  switch (phase) {
    case "active":
      return "Current plan";
    case "complete":
      return "Plan complete";
    default:
      return assertNever(phase);
  }
}

export function nextCurrentPlanSurfaceModel(
  current: CurrentPlanSurfaceModel | null,
  selectedConversationId: string,
  activePlan: CurrentPlanModel | null,
  terminalMode: CurrentPlanTerminalMode | null = null,
): CurrentPlanSurfaceModel | null {
  if (activePlan !== null) {
    return { ...activePlan, phase: "active" };
  }
  if (current === null || current.conversationId !== selectedConversationId) {
    return null;
  }
  if (current.phase === "complete") {
    return current;
  }
  return currentPlanSurfaceModelForTerminal(current, terminalMode);
}

function currentPlanSurfaceModelForTerminal(
  current: CurrentPlanSurfaceModel,
  terminalMode: CurrentPlanTerminalMode | null,
): CurrentPlanSurfaceModel | null {
  switch (terminalMode) {
    case "completed":
      return { ...current, phase: "complete" };
    case "cancelled":
    case "failed":
    case null:
      return null;
    default:
      return assertNever(terminalMode);
  }
}

export function canDismissCompletedCurrentPlan(interaction: CurrentPlanInteractionState) {
  return !interaction.expanded && !interaction.focused && !interaction.hovered;
}

function terminalRunStatusModeFromRun(run: Run | undefined): CurrentPlanTerminalMode | null {
  if (!run) {
    return null;
  }
  switch (run.status) {
    case "completed":
    case "cancelled":
    case "failed":
      return run.status;
    case "queued":
    case "running":
      return null;
    default:
      return assertNever(run.status);
  }
}

function sameCurrentPlanSurface(
  current: CurrentPlanSurfaceModel | null,
  expected: CurrentPlanSurfaceModel,
) {
  return (
    current !== null &&
    current.conversationId === expected.conversationId &&
    current.runId === expected.runId &&
    current.sourceRunItemId === expected.sourceRunItemId &&
    current.phase === expected.phase
  );
}

function planStepStatusLabel(status: RunItemPlanStep["status"]) {
  switch (status) {
    case "completed":
      return "Done";
    case "inProgress":
      return "Active";
    case "pending":
      return "Pending";
    default:
      return assertNever(status);
  }
}

function planStepStatusClass(status: RunItemPlanStep["status"]) {
  switch (status) {
    case "completed":
      return "text-status-success";
    case "inProgress":
      return "text-foreground";
    case "pending":
      return "text-muted-foreground";
    default:
      return assertNever(status);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled current plan value: ${String(value)}`);
}
