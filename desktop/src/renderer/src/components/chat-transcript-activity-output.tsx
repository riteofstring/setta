import type { RunItemOutputAvailability } from "@generated/backend";

import type { RunItemOutputPageState } from "../stores/chat-store";
import { BrailleSpinner } from "./ascii-spinner";
import { ActivityPreBlock } from "./chat-transcript-activity-details";

export function ActivityOutput({
  loadMoreOutput,
  outputAvailability,
  outputPage,
  outputText,
  terminal,
}: {
  loadMoreOutput?: () => void;
  outputAvailability?: RunItemOutputAvailability | null;
  outputPage: RunItemOutputPageState | undefined;
  outputText: string;
  terminal: boolean;
}) {
  const availabilityMessage = activityOutputAvailabilityMessage(
    outputAvailability,
    outputText,
    outputPage,
    terminal,
  );
  if (!hasActivityOutput(outputText, outputPage, availabilityMessage)) {
    return null;
  }
  return (
    <div className="w-full max-w-full min-w-0 space-y-2 overflow-hidden">
      {outputText ? <ActivityPreBlock title="Output" value={outputText} /> : null}
      <ActivityOutputAvailability message={availabilityMessage} />
      <ActivityOutputError outputPage={outputPage} />
      <ActivityOutputLoadMore loadMoreOutput={loadMoreOutput} outputPage={outputPage} />
      <ActivityOutputLoading outputPage={outputPage} />
    </div>
  );
}

function ActivityOutputError({ outputPage }: { outputPage: RunItemOutputPageState | undefined }) {
  if (!outputPage?.error) {
    return null;
  }
  return <div className="font-medium text-status-critical">{outputPage.error}</div>;
}

function ActivityOutputLoadMore({
  loadMoreOutput,
  outputPage,
}: {
  loadMoreOutput?: () => void;
  outputPage: RunItemOutputPageState | undefined;
}) {
  if (!outputPage?.hasMore) {
    return null;
  }
  if (!loadMoreOutput) {
    return <div className="text-[11px] text-muted-foreground">More output is available.</div>;
  }
  return (
    <button
      className="self-start rounded-sm border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
      disabled={outputPage.loading}
      onClick={loadMoreOutput}
      type="button"
    >
      Load more
    </button>
  );
}

function ActivityOutputLoading({ outputPage }: { outputPage: RunItemOutputPageState | undefined }) {
  if (!outputPage?.loading) {
    return null;
  }
  return <BrailleSpinner className="text-muted-foreground" label="Loading tool output" />;
}

function ActivityOutputAvailability({ message }: { message: string }) {
  if (!message) {
    return null;
  }
  return (
    <section
      className="min-w-0"
      data-activity-detail-section="Output"
      data-activity-detail-kind="text"
    >
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase">Output</h4>
      <p className="text-[11px] text-muted-foreground">{message}</p>
    </section>
  );
}

function activityOutputAvailabilityMessage(
  outputAvailability: RunItemOutputAvailability | null | undefined,
  outputText: string,
  outputPage: RunItemOutputPageState | undefined,
  terminal: boolean,
) {
  if (suppressOutputAvailabilityMessage(outputText, outputPage, terminal)) {
    return "";
  }
  return outputAvailabilityMessage(outputAvailability);
}

function suppressOutputAvailabilityMessage(
  outputText: string,
  outputPage: RunItemOutputPageState | undefined,
  terminal: boolean,
) {
  if (!terminal) {
    return true;
  }
  if (outputText) {
    return true;
  }
  return outputPageHasVisibleState(outputPage);
}

function outputPageHasVisibleState(outputPage: RunItemOutputPageState | undefined) {
  if (outputPage === undefined) {
    return false;
  }
  if (outputPage.hasMore) {
    return true;
  }
  if (outputPage.loading) {
    return true;
  }
  return Boolean(outputPage.error);
}

function outputAvailabilityMessage(
  outputAvailability: RunItemOutputAvailability | null | undefined,
) {
  switch (outputAvailability) {
    case "empty":
      return "Command completed with no output.";
    case "unavailable":
      return "Command output was unavailable from the provider.";
    case "captured":
    case null:
    case undefined:
      return "";
    default: {
      const _exhaustive: never = outputAvailability;
      return _exhaustive;
    }
  }
}

function hasActivityOutput(
  outputText: string,
  outputPage: RunItemOutputPageState | undefined,
  availabilityMessage: string,
) {
  if (outputText) {
    return true;
  }
  if (availabilityMessage) {
    return true;
  }
  return outputPageHasVisibleState(outputPage);
}
