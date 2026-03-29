import { buildChatHistoryEntries } from "state/actions/chatHistory";
import {
  SectionTypeEnum,
  createCore,
  createProjectConfig,
  createTextBlockSectionImpl,
  createVariant,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStandaloneProjectSurfacePageTargetProjectState,
  buildStandaloneProjectSurfacePageTargetState,
  canRenderStandaloneSurfaceTarget,
  resolveStandaloneSurfaceTarget,
  type StandaloneProjectSurfacePageTargetProjectState,
  type StandaloneProjectSurfacePageTargetProjectStateRefs,
} from "./standaloneProjectSurfacePageTargetState";

vi.mock("state/actions/chatHistory", () => ({
  buildChatHistoryEntries: vi.fn(),
}));

const buildChatHistoryEntriesMock = vi.mocked(buildChatHistoryEntries);

function createProjectState({
  sectionId,
  sectionName,
}: {
  sectionId?: string;
  sectionName?: string;
} = {}): StandaloneProjectSurfacePageTargetProjectState {
  const projectConfig = createProjectConfig({
    id: "project-config-1",
    sectionVariantMap: sectionId ? { [sectionId]: `${sectionId}-variant` } : {},
    windowSpaces: {},
  });

  if (!sectionId || !sectionName) {
    return {
      projectConfig: {
        id: projectConfig.id,
        windowSpaces: projectConfig.windowSpaces,
        sectionVariantMap: projectConfig.sectionVariantMap,
      },
      sections: {},
      sectionVariants: {},
      sectionImpls: {},
      parentSectionMap: {},
    };
  }

  const core = createCore({
    id: sectionId,
    name: sectionName,
    variants: [`${sectionId}-variant`],
    defaultVariant: `${sectionId}-variant`,
  });
  const variant = createVariant({
    id: `${sectionId}-variant`,
    impl: `${sectionId}-impl`,
    nonPresetImpls: [],
  });
  const impl = createTextBlockSectionImpl({
    id: `${sectionId}-impl`,
  });

  return {
    projectConfig: {
      id: projectConfig.id,
      windowSpaces: projectConfig.windowSpaces,
      sectionVariantMap: projectConfig.sectionVariantMap,
    },
    sections: {
      [sectionId]: core,
    },
    sectionVariants: {
      [variant.id]: variant,
    },
    sectionImpls: {
      [impl.id]: impl,
    },
    parentSectionMap: {
      [sectionId]: null,
    },
  };
}

describe("standaloneProjectSurfacePageTargetState", () => {
  beforeEach(() => {
    buildChatHistoryEntriesMock.mockReset();
    buildChatHistoryEntriesMock.mockReturnValue([]);
  });

  it("resolves standalone section slugs through the lifted target helper", () => {
    const projectState = createProjectState({
      sectionId: "section-1",
      sectionName: "Language Server",
    });

    expect(
      resolveStandaloneSurfaceTarget(
        projectState,
        "language_server",
        undefined,
        undefined,
      ),
    ).toEqual({
      kind: "section",
      sectionId: "section-1",
      sectionName: "Language Server",
      sectionType: SectionTypeEnum.TextBlock,
    });
  });

  it("rebuilds the lifted project state from stable store refs", () => {
    const projectStateRefs: StandaloneProjectSurfacePageTargetProjectStateRefs =
      {
        projectConfigId: "project-config-1",
        windowSpaces: {},
        sectionVariantMap: {
          "section-1": "section-1-variant",
        },
        sections: {
          "section-1": createCore({
            id: "section-1",
            name: "Language Server",
            variants: ["section-1-variant"],
            defaultVariant: "section-1-variant",
          }),
        },
        sectionVariants: {
          "section-1-variant": createVariant({
            id: "section-1-variant",
            impl: "section-1-impl",
            nonPresetImpls: [],
          }),
        },
        sectionImpls: {
          "section-1-impl": createTextBlockSectionImpl({
            id: "section-1-impl",
          }),
        },
        parentSectionMap: {
          "section-1": null,
        },
      };

    expect(
      buildStandaloneProjectSurfacePageTargetProjectState(projectStateRefs),
    ).toEqual({
      projectConfig: {
        id: "project-config-1",
        windowSpaces: {},
        sectionVariantMap: {
          "section-1": "section-1-variant",
        },
      },
      sections: projectStateRefs.sections,
      sectionVariants: projectStateRefs.sectionVariants,
      sectionImpls: projectStateRefs.sectionImpls,
      parentSectionMap: projectStateRefs.parentSectionMap,
    });
  });

  it("treats section targets as not ready until their live variant data is present", () => {
    const target = {
      kind: "section" as const,
      sectionId: "section-1",
      sectionName: "Language Server",
      sectionType: SectionTypeEnum.TextBlock,
    };

    expect(
      canRenderStandaloneSurfaceTarget({
        state: {
          projectConfig: {
            sectionVariantMap: {},
          },
          sections: {
            "section-1": createCore({
              id: "section-1",
              name: "Language Server",
              variants: ["section-1-variant"],
              defaultVariant: "section-1-variant",
            }),
          },
          sectionVariants: {},
          sectionImpls: {},
        },
        target,
      }),
    ).toBe(false);

    const readyState = createProjectState({
      sectionId: "section-1",
      sectionName: "Language Server",
    });
    expect(
      canRenderStandaloneSurfaceTarget({
        state: {
          projectConfig: {
            sectionVariantMap: readyState.projectConfig.sectionVariantMap,
          },
          sections: readyState.sections,
          sectionVariants: readyState.sectionVariants,
          sectionImpls: readyState.sectionImpls,
        },
        target,
      }),
    ).toBe(true);
  });

  it("builds project-chat target state and history entries from one deterministic helper", () => {
    const projectState = createProjectState();
    const chatHistoryEntries = [
      {
        chatId: "chat-alpha",
        label: "Alpha Chat",
        nameSource: "external",
        lastUpdatedMs: 1,
        waitingForResponse: false,
        runType: null,
        engineConfigId: null,
      },
    ];
    buildChatHistoryEntriesMock.mockReturnValue(chatHistoryEntries);

    const targetState = buildStandaloneProjectSurfacePageTargetState({
      projectState,
      sectionSlug: undefined,
      chatId: " chat-alpha ",
      windowSpaceSlug: undefined,
      agentRuns: [],
      isDeploymentMode: false,
      allowLLM: true,
    });

    expect(buildChatHistoryEntriesMock).toHaveBeenCalledWith([], {
      projectConfigId: "project-config-1",
      unscopedOnly: true,
    });
    expect(targetState).toEqual(
      expect.objectContaining({
        projectConfigId: "project-config-1",
        target: {
          kind: "project_chat_thread",
          chatId: "chat-alpha",
        },
        standaloneWindowSpace: null,
        canUseManagedChat: true,
        projectChatHistoryEntries: chatHistoryEntries,
      }),
    );
  });

  it("builds window-space target state and deployment LLM access from the lifted helper", () => {
    const projectState = createProjectState();
    const windowSpace = createWindowSpaceConfig({
      id: "window-space-1",
      name: "Workspace",
    });
    projectState.projectConfig.windowSpaces = {
      [windowSpace.id]: windowSpace,
    };

    const targetState = buildStandaloneProjectSurfacePageTargetState({
      projectState,
      sectionSlug: undefined,
      chatId: undefined,
      windowSpaceSlug: "workspace",
      agentRuns: [],
      isDeploymentMode: true,
      allowLLM: false,
    });

    expect(targetState).toEqual(
      expect.objectContaining({
        target: {
          kind: "window_space",
          windowSpaceId: "window-space-1",
          windowSpaceName: "Workspace",
        },
        standaloneWindowSpace: windowSpace,
        canUseManagedChat: false,
      }),
    );
  });
});
