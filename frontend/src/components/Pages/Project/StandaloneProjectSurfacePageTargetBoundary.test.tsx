/* @vitest-environment jsdom */

import {
  renderDefaultSectionContainerCoreBody,
  renderDefaultSectionContainerNestedSections,
} from "components/Section/Container/sectionContainerDefaultRenderers";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { SectionTypeEnum, createWindowSpaceConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StandaloneProjectSurfacePageTargetBoundary } from "./StandaloneProjectSurfacePageTargetBoundary";

const defaultRendererMocks = vi.hoisted(() => ({
  renderDefaultSectionContainerCoreBody: vi.fn(() => null),
  renderDefaultSectionContainerNestedSections: vi.fn(() => null),
}));

vi.mock(
  "components/Section/Container/sectionContainerDefaultRenderers",
  () => defaultRendererMocks,
);

type MockSectionCore = {
  name: string;
  sharedModifier?: Record<string, unknown>;
};

type MockSectionVariant = {
  impl: string;
  modifier?: Record<string, unknown>;
};

type MockSectionImpl = {
  type: string;
  managed?: boolean;
  children?: string[];
};

type MockProjectState = {
  projectConfig: {
    id: string;
    windowSpaces: Record<string, unknown>;
    sectionVariantMap: Record<string, string>;
  };
  sections: Record<string, MockSectionCore>;
  sectionVariants: Record<string, MockSectionVariant>;
  sectionImpls: Record<string, MockSectionImpl>;
  parentSectionMap: Record<string, string | null>;
};

type MockAIState = {
  agentRuns: Array<unknown>;
};

type MockShareSessionState = {
  isDeploymentMode: boolean;
  sharePolicy: {
    allowLLM: boolean;
  } | null;
};

const hoisted = vi.hoisted(() => {
  const state = {
    projectState: {
      projectConfig: {
        id: "project-config-1",
        windowSpaces: {},
        sectionVariantMap: {},
      },
      sections: {},
      sectionVariants: {},
      sectionImpls: {},
      parentSectionMap: {},
    } as MockProjectState,
    aiState: {
      agentRuns: [],
    } as MockAIState,
    shareSessionState: {
      isDeploymentMode: false,
      sharePolicy: {
        allowLLM: true,
      },
    } as MockShareSessionState,
    chatHistoryEntries: [] as Array<{ chatId: string; label: string }>,
  };

  const useProjectStateMock = Object.assign(
    (selector: (nextState: MockProjectState) => unknown) =>
      selector(state.projectState),
    {
      getState: () => state.projectState,
    },
  );

  const useAIStoreMock = Object.assign(
    (selector: (nextState: MockAIState) => unknown) => selector(state.aiState),
    {
      getState: () => state.aiState,
    },
  );

  const useShareSessionMock = Object.assign(
    (selector: (nextState: MockShareSessionState) => unknown) =>
      selector(state.shareSessionState),
    {
      getState: () => state.shareSessionState,
    },
  );

  const buildChatHistoryEntriesMock = vi.fn(() => state.chatHistoryEntries);

  return {
    buildChatHistoryEntriesMock,
    state,
    useProjectStateMock,
    useAIStoreMock,
    useShareSessionMock,
  };
});

const stateBoundaryMock = vi.fn();

vi.mock("state/actions/chatHistory", () => ({
  buildChatHistoryEntries: hoisted.buildChatHistoryEntriesMock,
}));

vi.mock("state/definitions", () => ({
  useAIStore: hoisted.useAIStoreMock,
  useProjectState: hoisted.useProjectStateMock,
  useShareSession: hoisted.useShareSessionMock,
}));

vi.mock("./StandaloneProjectSurfacePageStateBoundary", () => ({
  StandaloneProjectSurfacePageStateBoundary: ({
    projectConfigId,
    target,
    standaloneWindowSpace,
    canUseManagedChat,
    projectChatHistoryEntries,
    managedChatAuthorityState,
    renderCoreBody,
    renderNestedSections,
    renderDictArea,
  }: {
    projectConfigId: string;
    target: { kind: string };
    standaloneWindowSpace: { id: string; name: string } | null;
    canUseManagedChat: boolean;
    projectChatHistoryEntries: Array<{ chatId: string; label: string }>;
    managedChatAuthorityState: {
      projectConfig: {
        sectionVariantMap: Record<string, string>;
      };
      sections: Record<string, unknown>;
    };
    renderCoreBody: unknown;
    renderNestedSections: unknown;
    renderDictArea: unknown;
  }) => {
    stateBoundaryMock({
      projectConfigId,
      target,
      standaloneWindowSpace,
      canUseManagedChat,
      projectChatHistoryEntries,
      managedChatAuthorityState,
      renderCoreBody,
      renderNestedSections,
      hasRenderDictArea: Boolean(renderDictArea),
    });
    return <div data-testid="mock-standalone-project-surface-page-state" />;
  },
}));

function createBaseProps() {
  return {
    doneLoading: true,
    is404: false,
    projectConfigName: "demo",
    navigate: vi.fn(),
    renderDictArea: () => null,
    sectionSlug: undefined,
    chatId: undefined,
    windowSpaceSlug: undefined,
  };
}

function createTextSectionFixture({
  sectionId,
  sectionName,
}: {
  sectionId: string;
  sectionName: string;
}) {
  const variantId = `${sectionId}-variant`;
  const implId = `${sectionId}-impl`;
  return {
    sectionId,
    core: {
      name: sectionName,
      sharedModifier: {},
    } satisfies MockSectionCore,
    variantId,
    variant: {
      impl: implId,
      modifier: {},
    } satisfies MockSectionVariant,
    implId,
    impl: {
      type: SectionTypeEnum.TextBlock,
    } satisfies MockSectionImpl,
  };
}

describe("StandaloneProjectSurfacePageTargetBoundary", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    hoisted.state.projectState = {
      projectConfig: {
        id: "project-config-1",
        windowSpaces: {},
        sectionVariantMap: {},
      },
      sections: {},
      sectionVariants: {},
      sectionImpls: {},
      parentSectionMap: {},
    };
    hoisted.state.aiState = {
      agentRuns: [{ id: "run-1" }],
    };
    hoisted.state.shareSessionState = {
      isDeploymentMode: false,
      sharePolicy: {
        allowLLM: true,
      },
    };
    hoisted.state.chatHistoryEntries = [
      {
        chatId: "chat-alpha",
        label: "Alpha Chat",
      },
    ];
    hoisted.buildChatHistoryEntriesMock.mockClear();
    stateBoundaryMock.mockClear();
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

  it("resolves standalone chat targets and project-chat history through the lifted selector boundary", async () => {
    await act(async () => {
      root.render(
        <StandaloneProjectSurfacePageTargetBoundary
          {...createBaseProps()}
          chatId="chat-alpha"
        />,
      );
    });

    expect(hoisted.buildChatHistoryEntriesMock).toHaveBeenCalledWith(
      [{ id: "run-1" }],
      {
        projectConfigId: "project-config-1",
        unscopedOnly: true,
      },
    );
    expect(stateBoundaryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hasRenderDictArea: true,
        projectConfigId: "project-config-1",
        target: {
          kind: "project_chat_thread",
          chatId: "chat-alpha",
        },
        standaloneWindowSpace: null,
        canUseManagedChat: true,
        projectChatHistoryEntries: [
          {
            chatId: "chat-alpha",
            label: "Alpha Chat",
          },
        ],
        renderCoreBody: renderDefaultSectionContainerCoreBody,
        renderNestedSections: renderDefaultSectionContainerNestedSections,
      }),
    );
  });

  it("resolves standalone section slugs before handing off to the lower page-state boundary", async () => {
    const textSection = createTextSectionFixture({
      sectionId: "section-1",
      sectionName: "Language Server",
    });
    hoisted.state.projectState.sections[textSection.sectionId] =
      textSection.core;
    hoisted.state.projectState.sectionVariants[textSection.variantId] =
      textSection.variant;
    hoisted.state.projectState.sectionImpls[textSection.implId] =
      textSection.impl;
    hoisted.state.projectState.projectConfig.sectionVariantMap[
      textSection.sectionId
    ] = textSection.variantId;

    await act(async () => {
      root.render(
        <StandaloneProjectSurfacePageTargetBoundary
          {...createBaseProps()}
          sectionSlug="language_server"
        />,
      );
    });

    expect(stateBoundaryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hasRenderDictArea: true,
        target: {
          kind: "section",
          sectionId: "section-1",
          sectionName: "Language Server",
          sectionType: SectionTypeEnum.TextBlock,
        },
        managedChatAuthorityState: expect.objectContaining({
          projectConfig: {
            sectionVariantMap: {
              "section-1": "section-1-variant",
            },
          },
          sections: expect.objectContaining({
            "section-1": expect.objectContaining({
              name: "Language Server",
            }),
          }),
        }),
      }),
    );
  });

  it("resolves standalone window-space targets and deployment LLM policy through the lifted selector boundary", async () => {
    hoisted.state.projectState.projectConfig.windowSpaces = {
      "window-space-1": createWindowSpaceConfig({
        id: "window-space-1",
        name: "Workspace",
      }),
    };
    hoisted.state.shareSessionState = {
      isDeploymentMode: true,
      sharePolicy: {
        allowLLM: false,
      },
    };

    await act(async () => {
      root.render(
        <StandaloneProjectSurfacePageTargetBoundary
          {...createBaseProps()}
          windowSpaceSlug="workspace"
        />,
      );
    });

    expect(stateBoundaryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hasRenderDictArea: true,
        target: {
          kind: "window_space",
          windowSpaceId: "window-space-1",
          windowSpaceName: "Workspace",
        },
        standaloneWindowSpace: expect.objectContaining({
          id: "window-space-1",
          name: "Workspace",
        }),
        canUseManagedChat: false,
      }),
    );
  });
});
