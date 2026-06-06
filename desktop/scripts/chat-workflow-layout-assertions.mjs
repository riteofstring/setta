import { setTimeout as delay } from "node:timers/promises";

const layoutAssertionTimeoutMs = 5_000;
const layoutAssertionPollMs = 100;

export async function assertChatLayout(client) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < layoutAssertionTimeoutMs) {
    const metrics = await chatLayoutMetrics(client);
    const error = chatLayoutError(metrics);
    if (!error) {
      return;
    }
    lastError = error;
    await delay(layoutAssertionPollMs);
  }
  throw lastError ?? new Error("chat layout metrics were not captured");
}

async function chatLayoutMetrics(client) {
  return client.evaluate(`(() => {
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        bottom: box.bottom,
        height: box.height,
        top: box.top,
      };
    };
    const pane = document.querySelector('[data-testid="chat-detail-pane"]');
    const transcript = document.querySelector('[data-testid="chat-transcript-region"]');
    const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
    const composer = document.querySelector('[data-testid="chat-composer"]');
    return {
      composer: rect(composer),
      compactNiriHost: Boolean(pane?.closest('[data-testid="niri-fake-pane-host"]')),
      pane: rect(pane),
      scrollerClientHeight: scroller?.clientHeight ?? 0,
      scrollerScrollHeight: scroller?.scrollHeight ?? 0,
      transcript: rect(transcript),
    };
  })()`);
}

function chatLayoutError(metrics) {
  if (!metrics.pane || !metrics.transcript || !metrics.composer) {
    return new Error(`chat layout metrics missing required regions: ${JSON.stringify(metrics)}`);
  }
  if (chatTranscriptCollapsed(metrics)) {
    return new Error(`transcript region collapsed: ${JSON.stringify(metrics)}`);
  }
  if (chatRegionsOverlap(metrics.transcript, metrics.composer)) {
    return new Error(`transcript overlaps composer: ${JSON.stringify(metrics)}`);
  }
  if (chatRegionEscapes(metrics.composer, metrics.pane)) {
    return new Error(`composer escapes chat pane: ${JSON.stringify(metrics)}`);
  }
  return null;
}

function chatTranscriptCollapsed(metrics) {
  const minimums = chatLayoutMinimums(metrics.compactNiriHost);
  return (
    metrics.transcript.height < minimums.transcriptHeight ||
    metrics.scrollerClientHeight < minimums.scrollerHeight
  );
}

function chatLayoutMinimums(compactNiriHost) {
  if (compactNiriHost) {
    return { scrollerHeight: 40, transcriptHeight: 40 };
  }
  return { scrollerHeight: 120, transcriptHeight: 160 };
}

function chatRegionsOverlap(upper, lower) {
  return upper.bottom > lower.top + 1;
}

function chatRegionEscapes(child, parent) {
  return child.bottom > parent.bottom + 1;
}
