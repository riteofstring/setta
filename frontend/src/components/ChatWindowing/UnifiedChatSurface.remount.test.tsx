/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
} from "utils/generatedTypes";
import { UnifiedChatSurface } from "./UnifiedChatSurface";

vi.mock("components/Panes/Overview/ProjectLevelAI/ProjectChat", async () => {
  const { useState } = await import("react");
  return {
    ProjectChat: ({ chatId }: { chatId?: string | null }) => {
      const [isDirty, setIsDirty] = useState(false);
      return (
        <button
          type="button"
          data-testid="mock-project-chat-remount"
          data-chat-id={chatId ?? ""}
          data-is-dirty={isDirty ? "true" : "false"}
          onClick={() => setIsDirty(true)}
        />
      );
    },
  };
});

vi.mock("components/Section/Layouts/ChatArea", async () => {
  const { useState } = await import("react");
  return {
    ChatArea: ({ sectionId }: { sectionId: string }) => {
      const [isDirty, setIsDirty] = useState(false);
      return (
        <button
          type="button"
          data-testid="mock-section-chat-remount"
          data-section-id={sectionId}
          data-is-dirty={isDirty ? "true" : "false"}
          onClick={() => setIsDirty(true)}
        />
      );
    },
  };
});

vi.mock("state/definitions", async () => {
  const { createProjectChatWindowingState: createWindowingState } =
    await import("utils/generatedTypes");
  return {
    useProjectState: (selector: (state: object) => unknown) =>
      selector({
        projectChatWindowing: createWindowingState(),
        sections: {},
        projectConfig: { id: "project-1" },
      }),
  };
});

describe("UnifiedChatSurface remount boundaries", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("resets project-chat local state when the canonical surface id changes", async () => {
    await act(async () => {
      root.render(
        <UnifiedChatSurface
          mode={ChatWindowModeEnum.project_ai_mode}
          host={ChatWindowPlacementEnum.floating}
          surfaceId="workspace:project-1:window-1"
        />,
      );
    });

    const projectChatButton = host.querySelector(
      '[data-testid="mock-project-chat-remount"]',
    ) as HTMLButtonElement | null;
    if (!projectChatButton) {
      throw new Error("Expected mocked project chat.");
    }

    await act(async () => {
      projectChatButton.click();
    });
    expect(projectChatButton.getAttribute("data-is-dirty")).toBe("true");

    await act(async () => {
      root.render(
        <UnifiedChatSurface
          mode={ChatWindowModeEnum.project_ai_mode}
          host={ChatWindowPlacementEnum.floating}
          surfaceId="standalone-window-space:project-1:space-1:window-1"
        />,
      );
    });

    expect(
      host
        .querySelector('[data-testid="mock-project-chat-remount"]')
        ?.getAttribute("data-is-dirty"),
    ).toBe("false");
  });

  it("resets standalone project-chat local state when the route-owned chat id changes on the same host", async () => {
    await act(async () => {
      root.render(
        <UnifiedChatSurface
          mode={ChatWindowModeEnum.project_ai_mode}
          host="standalone_page"
          projectChatId="chat-alpha"
        />,
      );
    });

    const projectChatButton = host.querySelector(
      '[data-testid="mock-project-chat-remount"]',
    ) as HTMLButtonElement | null;
    if (!projectChatButton) {
      throw new Error("Expected mocked project chat.");
    }

    expect(projectChatButton.getAttribute("data-chat-id")).toBe("chat-alpha");

    await act(async () => {
      projectChatButton.click();
    });
    expect(projectChatButton.getAttribute("data-is-dirty")).toBe("true");

    await act(async () => {
      root.render(
        <UnifiedChatSurface
          mode={ChatWindowModeEnum.project_ai_mode}
          host="standalone_page"
          projectChatId="chat-beta"
        />,
      );
    });

    const reboundProjectChatButton = host.querySelector(
      '[data-testid="mock-project-chat-remount"]',
    );
    expect(reboundProjectChatButton?.getAttribute("data-chat-id")).toBe(
      "chat-beta",
    );
    expect(reboundProjectChatButton?.getAttribute("data-is-dirty")).toBe(
      "false",
    );
  });

  it("resets section-chat local state when the bound section owner changes on the same host", async () => {
    await act(async () => {
      root.render(
        <UnifiedChatSurface
          mode={ChatWindowModeEnum.section_mode}
          host={ChatWindowPlacementEnum.floating}
          sectionId="section-a"
          surfaceId="workspace:project-1:window-1"
        />,
      );
    });

    const sectionChatButton = host.querySelector(
      '[data-testid="mock-section-chat-remount"]',
    ) as HTMLButtonElement | null;
    if (!sectionChatButton) {
      throw new Error("Expected mocked section chat.");
    }

    await act(async () => {
      sectionChatButton.click();
    });
    expect(sectionChatButton.getAttribute("data-is-dirty")).toBe("true");

    await act(async () => {
      root.render(
        <UnifiedChatSurface
          mode={ChatWindowModeEnum.section_mode}
          host={ChatWindowPlacementEnum.floating}
          sectionId="section-b"
          surfaceId="workspace:project-1:window-1"
        />,
      );
    });

    const reboundSectionButton = host.querySelector(
      '[data-testid="mock-section-chat-remount"]',
    );
    expect(reboundSectionButton?.getAttribute("data-is-dirty")).toBe("false");
    expect(reboundSectionButton?.getAttribute("data-section-id")).toBe(
      "section-b",
    );
  });
});
