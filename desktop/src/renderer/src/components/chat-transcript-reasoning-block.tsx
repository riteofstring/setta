import type { TranscriptBlock } from "@generated/backend";
import { Brain, ChevronDown, Sparkles } from "lucide-react";

import { cn } from "../lib/utils";
import { BrailleSpinner } from "./ascii-spinner";
import { chatReadableColumnAttributes, chatReadableColumnPaddedClass } from "./chat-layout";
import { LiveHeadlineText } from "./live-headline-text";

// Reasoning is one stable transcript block kind with two display modes. The
// derived public headline persists across the thinking-to-summary transition and
// stays on the collapsed row, so an in-place mode change keeps the same one-line
// height and never shifts later blocks. Hidden/private reasoning never reaches the
// renderer: the backend only emits a reasoning block when a public headline or
// summary exists.
export function ReasoningBlock({ block }: { block: TranscriptBlock }) {
  const reasoning = block.reasoning;
  if (!reasoning) {
    return null;
  }
  const live = block.status === "streaming";
  if (reasoning.mode === "summary" && reasoning.summary !== "") {
    return (
      <ReasoningSummaryRow
        headline={reasoning.headline}
        runId={block.runId}
        summary={reasoning.summary}
      />
    );
  }
  return <ReasoningThinkingRow headline={reasoning.headline} live={live} runId={block.runId} />;
}

function ReasoningThinkingRow({
  headline,
  live,
  runId,
}: {
  headline: string;
  live: boolean;
  runId: string;
}) {
  return (
    <div {...chatReadableColumnAttributes} className={chatReadableColumnPaddedClass}>
      <div
        className="flex h-6 min-w-0 items-center gap-2 text-xs text-muted-foreground"
        data-block-kind="reasoning"
        data-reasoning-mode="thinking"
        data-run-id={runId}
        data-transcript-block="true"
      >
        <Brain
          className={cn("h-4 w-4 shrink-0", live ? "text-accent-violet" : "text-muted-foreground")}
        />
        <LiveHeadlineText active={live} className="min-w-0 truncate">
          {headline}
        </LiveHeadlineText>
        {live ? <BrailleSpinner className="text-accent-violet" label="Reasoning" /> : null}
      </div>
    </div>
  );
}

function ReasoningSummaryRow({
  headline,
  runId,
  summary,
}: {
  headline: string;
  runId: string;
  summary: string;
}) {
  return (
    <div {...chatReadableColumnAttributes} className={chatReadableColumnPaddedClass}>
      <details
        className="group/reasoning min-w-0"
        data-block-kind="reasoning"
        data-reasoning-mode="summary"
        data-run-id={runId}
        data-transcript-block="true"
      >
        <summary className="flex h-6 min-w-0 cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground marker:hidden">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent-violet" />
          <span className="min-w-0 flex-1 truncate">{headline}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open/reasoning:rotate-180" />
        </summary>
        <div className="mt-1 ml-[22px] border-l border-border/70 pl-2.5 text-xs leading-5 break-words whitespace-pre-wrap text-muted-foreground">
          {summary}
        </div>
      </details>
    </div>
  );
}
