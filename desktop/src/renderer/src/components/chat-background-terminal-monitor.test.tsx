import { describe, expect, test } from "vitest";

import { backgroundTerminalProcess } from "../stores/chat-store-events.test.helpers";
import {
  canDismissCompletedBackgroundTerminals,
  nextBackgroundTerminalSurfaceModel,
} from "./chat-background-terminal-monitor";

describe("background terminal surface model", () => {
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

  test("preserves active background terminal state across an empty refresh projection", () => {
    const running = backgroundTerminalProcess("background_terminal_alpha");
    const exited = backgroundTerminalProcess("background_terminal_alpha", {
      completedAt: "2026-05-29T20:00:05Z",
      status: "exited",
      updatedAt: "2026-05-29T20:00:05Z",
    });

    const activeSurface = nextBackgroundTerminalSurfaceModel(null, "conversation_api", [running]);
    const preservedSurface = nextBackgroundTerminalSurfaceModel(
      activeSurface,
      "conversation_api",
      [],
    );
    expect(preservedSurface).toEqual(activeSurface);

    const completedSurface = nextBackgroundTerminalSurfaceModel(
      preservedSurface,
      "conversation_api",
      [exited],
    );
    expect(completedSurface?.phase).toBe("complete");
    expect(completedSurface?.terminalIds).toEqual([exited.id]);
  });

  test("shows completed background terminal dwell when the monitor observes the exit", () => {
    const exited = backgroundTerminalProcess("background_terminal_alpha", {
      completedAt: "2026-05-29T20:00:05Z",
      status: "exited",
      updatedAt: "2026-05-29T20:00:05Z",
    });

    expect(nextBackgroundTerminalSurfaceModel(null, "conversation_api", [exited])).toBeNull();
    const completedSurface = nextBackgroundTerminalSurfaceModel(
      null,
      "conversation_api",
      [exited],
      new Set(),
      { showCompletedExitsFromOpenMonitor: true },
    );
    expect(completedSurface?.phase).toBe("complete");
    expect(completedSurface?.terminalIds).toEqual([exited.id]);
  });

  test("keeps failed and lost background terminals visible until dismissed", () => {
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
    expect(failedSurface?.phase).toBe("attention");
    expect(failedSurface?.terminalIds).toEqual([failed.id]);

    const dismissedSurface = nextBackgroundTerminalSurfaceModel(
      failedSurface,
      "conversation_api",
      [failed],
      new Set([failed.id]),
    );
    expect(dismissedSurface).toBeNull();

    const lostSurface = nextBackgroundTerminalSurfaceModel(null, "conversation_api", [lost]);
    expect(lostSurface?.phase).toBe("attention");
    expect(lostSurface?.terminalIds).toEqual([lost.id]);
  });

  test("blocks completed background-terminal dismissal while the user is interacting", () => {
    expect(
      canDismissCompletedBackgroundTerminals({
        focused: false,
        hovered: false,
        monitorOpen: false,
      }),
    ).toBe(true);
    expect(
      canDismissCompletedBackgroundTerminals({
        focused: true,
        hovered: false,
        monitorOpen: false,
      }),
    ).toBe(false);
    expect(
      canDismissCompletedBackgroundTerminals({
        focused: false,
        hovered: true,
        monitorOpen: false,
      }),
    ).toBe(false);
    expect(
      canDismissCompletedBackgroundTerminals({
        focused: false,
        hovered: false,
        monitorOpen: true,
      }),
    ).toBe(false);
  });
});
