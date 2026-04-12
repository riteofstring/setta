import { useEffect, useRef, useState } from "react";

type ThinkingSummaryItem = {
  thinking: string;
  summary?: string | null;
};

type ThinkingSummaryContent = {
  content: string;
  summary: string | null | undefined;
};

export function deriveThinkingHeadlineFromContent(
  content: string,
): string | null {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const normalizedLines = trimmed
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      line
        .replace(/^#+\s+/u, "")
        .replace(/^(?:>+|\*|-)\s*/u, "")
        .replace(/^\d+\.\s*/u, "")
        .replace(/\s+/gu, " ")
        .trim(),
    )
    .filter((line) => line.length > 0);
  const collapsed =
    normalizedLines[0] ??
    trimmed
      .replace(/\s+/gu, " ")
      .replace(/^#+\s+/u, "")
      .replace(/^(?:>+|\*|-)\s*/u, "")
      .replace(/^\d+\.\s*/u, "")
      .trim();
  if (collapsed.length === 0) {
    return null;
  }
  const maxLength = 96;
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength).trimEnd()}...`;
}

function normalizeThinkingSummaryText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function resolveDistinctSummaryHeadline({
  content,
  summary,
}: ThinkingSummaryContent): string | null {
  const summaryText = summary?.trim() ?? "";
  const summaryHeadline = (summaryText.split(/\r?\n/u)[0] ?? "").trim();
  if (summaryHeadline.length === 0) {
    return null;
  }
  const normalizedSummaryText = normalizeThinkingSummaryText(summaryText);
  const normalizedThinkingText = normalizeThinkingSummaryText(content);
  if (
    normalizedSummaryText.length > 0 &&
    normalizedThinkingText.length > 0 &&
    normalizedSummaryText === normalizedThinkingText
  ) {
    return null;
  }
  return summaryHeadline;
}

function resolveCompletedThinkingSummaryMeta({
  content,
  summary,
}: ThinkingSummaryContent): { headline: string; hasTitle: boolean } {
  const summaryHeadline = resolveDistinctSummaryHeadline({ content, summary });
  if (summaryHeadline) {
    return { headline: summaryHeadline, hasTitle: true };
  }
  if (content.trim().length === 0) {
    return { headline: "Reasoning complete.", hasTitle: false };
  }
  const derivedHeadline = deriveThinkingHeadlineFromContent(content);
  if (derivedHeadline) {
    return { headline: derivedHeadline, hasTitle: true };
  }
  return {
    headline: "Summary unavailable. Expand to view full reasoning.",
    hasTitle: false,
  };
}

export function resolveThinkingSummaryMeta({
  content,
  summary,
  isStreaming,
}: ThinkingSummaryContent & {
  isStreaming: boolean;
}): { headline: string; hasTitle: boolean } {
  if (isStreaming) {
    return { headline: "Thinking...", hasTitle: false };
  }
  return resolveCompletedThinkingSummaryMeta({ content, summary });
}

export function resolveStreamingThinkingHeadline({
  content,
  summary,
}: ThinkingSummaryContent): string | null {
  return (
    resolveDistinctSummaryHeadline({ content, summary }) ??
    deriveThinkingHeadlineFromContent(content)
  );
}

export function resolveThinkingSummaryHeadline({
  content,
  summary,
  isStreaming,
}: {
  content: string;
  summary: string | null | undefined;
  isStreaming: boolean;
}): string {
  if (isStreaming) {
    return (
      resolveStreamingThinkingHeadline({ content, summary }) ?? "Thinking..."
    );
  }
  return resolveThinkingSummaryMeta({ content, summary, isStreaming }).headline;
}

export function resolveCollapsedThinkingActivityLabel({
  isStreaming,
}: {
  isStreaming: boolean;
}): string {
  return isStreaming ? "Thinking" : "Reasoning";
}

export function resolveLatestThinkingSummary(
  thinkingItems: ThinkingSummaryItem[],
  isStreaming: boolean,
): string {
  const latestItem = thinkingItems[thinkingItems.length - 1];
  if (!latestItem) {
    return "No thoughts yet.";
  }
  return resolveThinkingSummaryHeadline({
    content: latestItem.thinking,
    summary: latestItem.summary,
    isStreaming,
  });
}

const SCRAMBLE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SCRAMBLE_UPDATE_INTERVAL_MS = 120;
const SCRAMBLE_REVEAL_DURATION_MS = 220;
const SCRAMBLE_MAX_HOLD_MS = 240;

function sampleScrambleChar(): string {
  const index = Math.floor(Math.random() * SCRAMBLE_CHARSET.length);
  return SCRAMBLE_CHARSET[index] ?? "X";
}

function buildScramblePlaceholder(length: number): string {
  const chars: string[] = [];
  for (let index = 0; index < length; index += 1) {
    chars.push(sampleScrambleChar());
  }
  return chars.join("");
}

function buildScrambleRevealText({
  targetText,
  length,
  revealCount,
}: {
  targetText: string;
  length: number;
  revealCount: number;
}): string {
  if (length <= 0) {
    return "";
  }
  const chars: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const targetChar = targetText[index];
    if (index < revealCount && targetChar !== undefined) {
      chars.push(targetChar);
      continue;
    }
    if (targetChar === " ") {
      chars.push(" ");
      continue;
    }
    chars.push(sampleScrambleChar());
  }
  return chars.join("");
}

export function useScrambledLabel({
  label,
  scramble,
}: {
  label: string;
  scramble: boolean;
}): string {
  const [displayText, setDisplayText] = useState(label);
  const displayRef = useRef(label);
  const scrambleSeedRef = useRef(label.length > 0 ? label.length : 24);
  const previousScrambleRef = useRef(scramble);

  useEffect(() => {
    displayRef.current = displayText;
  }, [displayText]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setDisplayText(label);
      return;
    }
    let intervalId: number | null = null;
    let frameId: number | null = null;
    let holdTimeoutId: number | null = null;
    if (scramble) {
      scrambleSeedRef.current = Math.max(
        18,
        Math.min(64, displayRef.current.length || label.length || 24),
      );
      const updateScramble = () => {
        setDisplayText(buildScramblePlaceholder(scrambleSeedRef.current));
      };
      updateScramble();
      intervalId = window.setInterval(
        updateScramble,
        SCRAMBLE_UPDATE_INTERVAL_MS,
      );
      holdTimeoutId = window.setTimeout(() => {
        if (!previousScrambleRef.current) {
          return;
        }
        if (intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
        setDisplayText(label);
      }, SCRAMBLE_MAX_HOLD_MS);
      previousScrambleRef.current = true;
      return () => {
        if (intervalId !== null) {
          window.clearInterval(intervalId);
        }
        if (holdTimeoutId !== null) {
          window.clearTimeout(holdTimeoutId);
        }
      };
    }
    const wasScrambling = previousScrambleRef.current;
    previousScrambleRef.current = false;
    if (!wasScrambling) {
      setDisplayText(label);
      return undefined;
    }
    const startText = displayRef.current;
    const startLength = startText.length;
    const targetLength = label.length;
    const durationMs = SCRAMBLE_REVEAL_DURATION_MS;
    const startTs = window.performance.now();
    const animate = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startTs) / durationMs);
      const nextLength = Math.max(
        1,
        Math.round(startLength + (targetLength - startLength) * progress),
      );
      const revealCount = Math.floor(targetLength * progress);
      if (progress >= 1) {
        setDisplayText(label);
        return;
      }
      setDisplayText(
        buildScrambleRevealText({
          targetText: label,
          length: nextLength,
          revealCount,
        }),
      );
      frameId = window.requestAnimationFrame(animate);
    };
    frameId = window.requestAnimationFrame(animate);
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      if (holdTimeoutId !== null) {
        window.clearTimeout(holdTimeoutId);
      }
    };
  }, [label, scramble]);

  return displayText;
}
