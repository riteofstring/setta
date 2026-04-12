/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import "testUtils/reactRefreshPreamble";
import {
  type BaseChatMessageUnion,
  ChatRoleEnum,
  createMessageTextContent,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatMessageTimestampFooter,
  ChatTimestamp,
  formatChatTimestamp,
  formatChatTimestampTitle,
  parseIsoTimestampMs,
  resolveActivityTimestampMs,
  resolveDurationLabel,
  resolveMessageCreatedAtMs,
  useRunElapsedDuration,
} from "./chatTiming";

type ElapsedHarnessProps = {
  active: boolean;
  startedAtMs?: number | null;
  completedAtMs?: number | null;
  runKey?: string;
};

function formatExpectedChatTimestamp(timestampMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestampMs);
}

function formatExpectedChatTimestampTitle(timestampMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "long",
  }).format(timestampMs);
}

describe("chatTiming", () => {
  let host: HTMLDivElement;
  let root: Root;
  let latestDuration: ReturnType<typeof useRunElapsedDuration> | null;

  function ElapsedHarness({
    active,
    startedAtMs,
    completedAtMs,
    runKey,
  }: ElapsedHarnessProps) {
    latestDuration = useRunElapsedDuration({
      active,
      startedAtMs,
      completedAtMs,
      runKey,
    });
    return null;
  }

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    latestDuration = null;
  });

  afterEach(async () => {
    vi.useRealTimers();
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("formats chat timestamps and tooltip titles consistently", () => {
    const timestampMs = Date.parse("2026-01-01T09:16:00Z");

    expect(formatChatTimestamp(timestampMs)).toBe(
      formatExpectedChatTimestamp(timestampMs),
    );
    expect(formatChatTimestampTitle(timestampMs)).toBe(
      formatExpectedChatTimestampTitle(timestampMs),
    );
  });

  it("renders timestamp surfaces only when timestamp data is valid", () => {
    const timestampMs = Date.parse("2026-01-01T09:16:00Z");
    const messageMarkup = renderToStaticMarkup(
      <ChatTimestamp timestampMs={timestampMs} kind="message" />,
    );
    const activityMarkup = renderToStaticMarkup(
      <ChatTimestamp timestampMs={timestampMs} kind="activity-item" />,
    );
    const footerMarkup = renderToStaticMarkup(
      <ChatMessageTimestampFooter timestampMs={timestampMs} />,
    );

    expect(messageMarkup).toContain('data-chat-message-timestamp="true"');
    expect(activityMarkup).toContain(
      'data-chat-activity-item-timestamp="true"',
    );
    expect(footerMarkup).toContain(formatExpectedChatTimestamp(timestampMs));
    expect(footerMarkup).toContain(
      `title="${formatExpectedChatTimestampTitle(timestampMs)}"`,
    );
    expect(
      renderToStaticMarkup(<ChatTimestamp timestampMs={null} kind="message" />),
    ).toBe("");
    expect(
      renderToStaticMarkup(<ChatMessageTimestampFooter timestampMs={null} />),
    ).toBe("");
  });

  it("resolves duration and timestamp helpers deterministically", () => {
    const startedAtMs = Date.parse("2026-01-01T09:16:00Z");
    const completedAtMs = Date.parse("2026-01-01T09:16:08Z");
    const message: BaseChatMessageUnion = {
      id: "msg-1",
      role: ChatRoleEnum.user,
      content: [createMessageTextContent({ text: "Hello" })],
      attachments: [],
      createdAt: startedAtMs,
    };

    expect(resolveDurationLabel).toBeTypeOf("function");
    expect(
      resolveDurationLabel({
        elapsedMs: 0,
        elapsedSeconds: 0,
        hasKnownDuration: true,
        isRunning: false,
      }),
    ).toBe("<1s");
    expect(
      resolveDurationLabel({
        elapsedMs: 8_000,
        elapsedSeconds: 8,
        hasKnownDuration: true,
        isRunning: false,
      }),
    ).toBe("00:08");
    expect(
      resolveDurationLabel({
        elapsedMs: 8_000,
        elapsedSeconds: 8,
        hasKnownDuration: false,
        isRunning: false,
      }),
    ).toBeNull();
    expect(resolveActivityTimestampMs(startedAtMs, completedAtMs)).toBe(
      startedAtMs,
    );
    expect(resolveActivityTimestampMs(null, completedAtMs)).toBe(completedAtMs);
    expect(resolveMessageCreatedAtMs(message)).toBe(startedAtMs);
    expect(
      resolveMessageCreatedAtMs({ ...message, createdAt: "bad" }),
    ).toBeNull();
    expect(parseIsoTimestampMs("2026-01-01T09:16:00Z")).toBe(startedAtMs);
    expect(parseIsoTimestampMs("not-a-timestamp")).toBeNull();
  });

  it("tracks active and completed elapsed durations for a stable run key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:10Z"));
    const startedAtMs = Date.parse("2026-01-01T00:00:05Z");

    await act(async () => {
      root.render(
        <ElapsedHarness
          active={true}
          startedAtMs={startedAtMs}
          runKey="chat-run-1"
        />,
      );
    });

    expect(latestDuration).not.toBeNull();
    expect(latestDuration?.elapsedSeconds).toBe(5);
    expect(latestDuration?.hasKnownDuration).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(latestDuration?.elapsedSeconds).toBe(7);

    await act(async () => {
      root.render(
        <ElapsedHarness
          active={false}
          startedAtMs={startedAtMs}
          completedAtMs={Date.parse("2026-01-01T00:00:12Z")}
          runKey="chat-run-1"
        />,
      );
    });

    expect(latestDuration?.elapsedSeconds).toBe(7);
    expect(latestDuration?.elapsedMs).toBe(7_000);
    expect(latestDuration?.hasKnownDuration).toBe(true);
  });
});
