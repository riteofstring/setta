/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionTypeEnum, createWindowSpaceConfig } from "utils/generatedTypes";
import { StandaloneProjectSurfacePageStateBoundary } from "./StandaloneProjectSurfacePageStateBoundary";

const pageBoundaryMock = vi.fn();

vi.mock("components/Section/Container/SectionContainerAreaDictBoundary", () => ({
  SectionContainerAreaDictBoundary: () => null,
}));

vi.mock("./StandaloneProjectSurfacePageBoundary", () => ({
  StandaloneProjectSurfacePageBoundary: ({
    projectChatThreadTitle,
    renderDictArea,
    standaloneProjectChatId,
    standaloneProjectChatThreadRouteInvalid,
    standaloneProjectChatThreadMissing,
    shouldBlockStandaloneManagedChat,
    setStandaloneProjectChatId,
  }: {
    projectChatThreadTitle: string | null;
    renderDictArea: unknown;
    standaloneProjectChatId: string | null;
    standaloneProjectChatThreadRouteInvalid: boolean;
    standaloneProjectChatThreadMissing: boolean;
    shouldBlockStandaloneManagedChat: boolean;
    setStandaloneProjectChatId: (next: string | null) => void;
  }) => {
    pageBoundaryMock({
      projectChatThreadTitle,
      hasRenderDictArea: Boolean(renderDictArea),
      standaloneProjectChatId,
      standaloneProjectChatThreadRouteInvalid,
      standaloneProjectChatThreadMissing,
      shouldBlockStandaloneManagedChat,
    });
    return (
      <div data-testid="mock-standalone-project-surface-page-boundary">
        <button
          type="button"
          data-testid="mock-open-project-chat-root"
          onClick={() => {
            setStandaloneProjectChatId(null);
          }}
        >
          Open project chat root
        </button>
      </div>
    );
  },
}));

const managedChatAuthorityState = {
  projectConfig: {
    sectionVariantMap: {},
  },
  sections: {},
  sectionVariants: {},
  sectionImpls: {},
};

function createBaseProps() {
  return {
    doneLoading: true,
    is404: false,
    projectConfigName: "demo",
    projectConfigId: "project-config-1",
    target: {
      kind: "project_chat_thread" as const,
      chatId: "chat-alpha",
    },
    standaloneWindowSpace: createWindowSpaceConfig({
      id: "window-space-1",
      name: "Workspace",
    }),
    managedChatAuthorityState,
    canUseManagedChat: true,
    projectChatHistoryEntries: [
      {
        chatId: "chat-alpha",
        label: "Alpha Chat",
      },
    ],
    navigate: vi.fn(),
  };
}

function click(node: Element | null): void {
  if (!(node instanceof HTMLElement)) {
    throw new Error("Expected clickable element.");
  }
  node.click();
}

describe("StandaloneProjectSurfacePageStateBoundary", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    pageBoundaryMock.mockClear();
    document.title = "before";
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("derives the lifted standalone chat route state before handing off to the lower page boundary", async () => {
    const props = createBaseProps();

    await act(async () => {
      root.render(<StandaloneProjectSurfacePageStateBoundary {...props} />);
    });

    expect(pageBoundaryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hasRenderDictArea: true,
        projectChatThreadTitle: "Alpha Chat",
        standaloneProjectChatId: "chat-alpha",
        standaloneProjectChatThreadRouteInvalid: false,
        standaloneProjectChatThreadMissing: false,
        shouldBlockStandaloneManagedChat: false,
      }),
    );
    expect(document.title).toBe("demo · Alpha Chat");
  });

  it("routes project chat selection changes through the lifted page-state boundary", async () => {
    const props = createBaseProps();

    await act(async () => {
      root.render(<StandaloneProjectSurfacePageStateBoundary {...props} />);
    });

    await act(async () => {
      click(host.querySelector('[data-testid="mock-open-project-chat-root"]'));
    });

    expect(props.navigate).toHaveBeenCalledWith("/demo/chat");
  });

  it("fails closed for invalid standalone chat thread routes before the lower page boundary renders a live thread surface", async () => {
    const props = createBaseProps();

    await act(async () => {
      root.render(
        <StandaloneProjectSurfacePageStateBoundary
          {...props}
          target={{
            kind: "project_chat_thread_not_found",
          }}
        />,
      );
    });

    expect(pageBoundaryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projectChatThreadTitle: null,
        standaloneProjectChatId: null,
        standaloneProjectChatThreadRouteInvalid: true,
        standaloneProjectChatThreadMissing: false,
      }),
    );
    expect(document.title).toBe("demo · Thread Not Found");
  });

  it("does not block standalone scriptable section routes when deployment mode disallows managed chat", async () => {
    const props = createBaseProps();

    await act(async () => {
      root.render(
        <StandaloneProjectSurfacePageStateBoundary
          {...props}
          canUseManagedChat={false}
          target={{
            kind: "section",
            sectionId: "section-1",
            sectionName: "Scriptable Chat",
            sectionType: SectionTypeEnum.Chat,
          }}
        />,
      );
    });

    expect(pageBoundaryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        shouldBlockStandaloneManagedChat: false,
      }),
    );
    expect(document.title).toBe("demo · Scriptable Chat");
  });
});
