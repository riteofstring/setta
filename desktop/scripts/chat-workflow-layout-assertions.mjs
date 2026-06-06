export async function assertChatLayout(client) {
  const metrics = await client.evaluate(`(() => {
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
  if (!metrics.pane || !metrics.transcript || !metrics.composer) {
    throw new Error(`chat layout metrics missing required regions: ${JSON.stringify(metrics)}`);
  }
  if (chatTranscriptCollapsed(metrics)) {
    throw new Error(`transcript region collapsed: ${JSON.stringify(metrics)}`);
  }
  if (chatRegionsOverlap(metrics.transcript, metrics.composer)) {
    throw new Error(`transcript overlaps composer: ${JSON.stringify(metrics)}`);
  }
  if (chatRegionEscapes(metrics.composer, metrics.pane)) {
    throw new Error(`composer escapes chat pane: ${JSON.stringify(metrics)}`);
  }
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
