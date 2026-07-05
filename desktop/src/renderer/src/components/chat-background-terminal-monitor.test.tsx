import { describe, expect, test } from "vitest";

import { backgroundTerminalProcess } from "../stores/chat-store-events.test.helpers";
import { nextBackgroundTerminalSurfaceModel } from "./chat-background-terminal-monitor";

describe("background terminal surface model", () => {
  test("renders running and terminating terminals as an active surface", () => {
    const running = backgroundTerminalProcess("background_terminal_running");
    const terminating = backgroundTerminalProcess("background_terminal_terminating", {
      status: "terminating",
    });

    expect(
      nextBackgroundTerminalSurfaceModel(null, "conversation_api", [running])?.terminalIds,
    ).toEqual([running.id]);
    expect(
      nextBackgroundTerminalSurfaceModel(null, "conversation_api", [terminating])?.terminalIds,
    ).toEqual([terminating.id]);
  });

  test("keeps completed background terminals for a dwell surface after active exit", () => {
    const running = backgroundTerminalProcess("background_terminal_alpha");
    const exited = backgroundTerminalProcess("background_terminal_alpha", {
      completedAt: "2026-05-29T20:00:05Z",
      status: "exited",
      updatedAt: "2026-05-29T20:00:05Z",
    });

    const activeSurface = nextBackgroundTerminalSurfaceModel(null, "conversation_api", [running]);
    expect(activeSurface?.phase).toBe("active");
    expect(activeSurface?.terminalIds).toEqual([running.id]);

    const completedSurface = nextBackgroundTerminalSurfaceModel(activeSurface, "conversation_api", [
      exited,
    ]);
    expect(completedSurface?.phase).toBe("complete");
    expect(completedSurface?.terminalIds).toEqual([exited.id]);

    expect(nextBackgroundTerminalSurfaceModel(null, "conversation_api", [exited])).toBeNull();
  });

  test("does not preserve active state across an empty backend projection", () => {
    const running = backgroundTerminalProcess("background_terminal_alpha");
    const activeSurface = nextBackgroundTerminalSurfaceModel(null, "conversation_api", [running]);
    expect(nextBackgroundTerminalSurfaceModel(activeSurface, "conversation_api", [])).toBeNull();
  });

  test("does not preserve completed dwell after the backend projection removes the terminal", () => {
    const running = backgroundTerminalProcess("background_terminal_alpha");
    const exited = backgroundTerminalProcess("background_terminal_alpha", {
      completedAt: "2026-05-29T20:00:05Z",
      status: "exited",
      updatedAt: "2026-05-29T20:00:05Z",
    });
    const activeSurface = nextBackgroundTerminalSurfaceModel(null, "conversation_api", [running]);
    const completedSurface = nextBackgroundTerminalSurfaceModel(activeSurface, "conversation_api", [
      exited,
    ]);

    expect(nextBackgroundTerminalSurfaceModel(completedSurface, "conversation_api", [])).toBeNull();
  });

  test("does not show completed dwell from an initially exited projection", () => {
    const exited = backgroundTerminalProcess("background_terminal_alpha", {
      completedAt: "2026-05-29T20:00:05Z",
      status: "exited",
      updatedAt: "2026-05-29T20:00:05Z",
    });

    expect(nextBackgroundTerminalSurfaceModel(null, "conversation_api", [exited])).toBeNull();
  });

  test("does not create persistent attention surfaces for failed or lost terminals", () => {
    const running = backgroundTerminalProcess("background_terminal_failed");
    const failed = backgroundTerminalProcess("background_terminal_failed", {
      completedAt: "2026-05-29T20:00:05Z",
      exitCode: 1,
      status: "exited",
      updatedAt: "2026-05-29T20:00:05Z",
    });
    const lost = backgroundTerminalProcess("background_terminal_lost", {
      error: "provider connection lost",
      status: "lost",
      updatedAt: "2026-05-29T20:00:05Z",
    });

    const activeSurface = nextBackgroundTerminalSurfaceModel(null, "conversation_api", [running]);
    const failedSurface = nextBackgroundTerminalSurfaceModel(activeSurface, "conversation_api", [
      failed,
    ]);
    expect(failedSurface).toBeNull();

    const lostSurface = nextBackgroundTerminalSurfaceModel(null, "conversation_api", [lost]);
    expect(lostSurface).toBeNull();
  });
});
