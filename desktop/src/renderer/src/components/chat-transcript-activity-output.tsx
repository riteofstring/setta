import type { RunItemOutputPageState } from "../stores/chat-store";
import { BrailleSpinner } from "./ascii-spinner";
import { ActivityPreBlock } from "./chat-transcript-activity-details";

export function ActivityOutput({
  loadMoreOutput,
  outputPage,
  outputText,
}: {
  loadMoreOutput?: () => void;
  outputPage: RunItemOutputPageState | undefined;
  outputText: string;
}) {
  if (!hasActivityOutput(outputText, outputPage)) {
    return null;
  }
  return (
    <div className="w-full max-w-full min-w-0 space-y-2 overflow-hidden">
      {outputText ? <ActivityPreBlock title="Output" value={outputText} /> : null}
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

function hasActivityOutput(outputText: string, outputPage: RunItemOutputPageState | undefined) {
  return Boolean(outputText || outputPage?.hasMore || outputPage?.loading || outputPage?.error);
}
