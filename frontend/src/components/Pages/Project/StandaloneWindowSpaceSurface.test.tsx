/* @vitest-environment jsdom */

import { act, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import "testUtils/reactRefreshPreamble";
import {
  ChatWindowModeEnum,
  WindowSpaceSurfaceKindEnum,
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createVariant,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StandaloneWindowSpaceSurface } from "./StandaloneWindowSpaceSurface";
import {
  applyStandaloneWindowSpaceHydration,
  mergeHydratedStandaloneWindows,
} from "./standaloneWindowSpaceState";

type MockProjectState = {
  projectConfig: {
    id: string;
  };
  sections: Record<string, { name: string; chatId?: string | null }>;
};

let mockProjectState: MockProjectState = {
  projectConfig: {
    id: "project-1",
  },
  sections: {},
};

const hoisted = vi.hoisted(() => ({
  blockedErrorCode: null as string | null,
}));

const EMPTY_MANAGED_CHAT_AUTHORITY_STATE = {
  projectConfig: createProjectConfig({
    sectionVariantMap: {},
  }),
  sections: {},
  sectionVariants: {},
  sectionImpls: {},
};

function createManagedChatAuthorityState() {
  const managedSectionId = "section-managed";
  const scriptableSectionId = "section-scriptable";
  const managedVariantId = "variant-managed";
  const scriptableVariantId = "variant-scriptable";
  const managedImplId = "impl-managed";
  const scriptableImplId = "impl-scriptable";

  return {
    state: {
      projectConfig: createProjectConfig({
        sectionVariantMap: {
          [managedSectionId]: managedVariantId,
          [scriptableSectionId]: scriptableVariantId,
        },
      }),
      sections: {
        [managedSectionId]: createCore({
          id: managedSectionId,
          name: "Managed Chat",
          variants: [managedVariantId],
          defaultVariant: managedVariantId,
        }),
        [scriptableSectionId]: createCore({
          id: scriptableSectionId,
          name: "Scriptable Chat",
          variants: [scriptableVariantId],
          defaultVariant: scriptableVariantId,
        }),
      },
      sectionVariants: {
        [managedVariantId]: createVariant({
          id: managedVariantId,
          name: "Managed Variant",
          impl: managedImplId,
          nonPresetImpls: [],
        }),
        [scriptableVariantId]: createVariant({
          id: scriptableVariantId,
          name: "Scriptable Variant",
          impl: scriptableImplId,
          nonPresetImpls: [],
        }),
      },
      sectionImpls: {
        [managedImplId]: createChatSectionImpl(
          createUserDefaultChatSectionImpl(),
          {
            id: managedImplId,
            managed: true,
          },
        ),
        [scriptableImplId]: createChatSectionImpl(
          createUserDefaultChatSectionImpl(),
          {
            id: scriptableImplId,
            managed: false,
          },
        ),
      },
    },
    managedSectionId,
    scriptableSectionId,
  };
}

vi.mock("state/definitions", () => ({
  useProjectState: (
    selector: (state: MockProjectState) => unknown,
    _equalityFn?: unknown,
  ) => selector(mockProjectState),
}));

vi.mock("components/ChatWindowing/ProjectChatWindowSurface", () => ({
  ProjectChatWindowSurface: ({
    title,
    children,
  }: {
    title: string;
    children: ReactNode;
  }) => (
    <div data-testid="mock-project-chat-window-surface">
      <span>{title}</span>
      {children}
    </div>
  ),
}));

vi.mock("components/ChatWindowing/UnifiedChatSurface", () => ({
  UnifiedChatSurface: ({
    projectChatId,
    mode,
    surfaceId,
    setProjectChatId,
    onProjectChatBlockedErrorCodeChange,
  }: {
    projectChatId?: string | null;
    mode?: string;
    surfaceId?: string;
    setProjectChatId?: (next: string | null) => void;
    onProjectChatBlockedErrorCodeChange?: (errorCode: string | null) => void;
  }) => {
    useEffect(() => {
      onProjectChatBlockedErrorCodeChange?.(hoisted.blockedErrorCode);
    }, [onProjectChatBlockedErrorCodeChange]);

    return (
      <div
        data-testid="mock-unified-chat-surface"
        data-project-chat-id={projectChatId ?? ""}
        data-project-chat-surface-id={surfaceId ?? ""}
        data-chat-surface-mode={mode ?? ""}
      >
        project chat:{projectChatId ?? "global"}
        {setProjectChatId ? (
          <button
            type="button"
            data-testid="mock-set-project-chat-id"
            onClick={() => {
              setProjectChatId("chat-local-override");
            }}
          >
            Set local chat
          </button>
        ) : null}
      </div>
    );
  },
}));

vi.mock("components/Git/GitGraphWindowContent", () => ({
  GitGraphWindowContent: ({
    instanceId,
    showEmbeddedGitPaneToggle = false,
    embeddedGitPaneVisible = false,
  }: {
    instanceId?: string | null;
    showEmbeddedGitPaneToggle?: boolean;
    embeddedGitPaneVisible?: boolean;
  }) => (
    <div
      data-testid="mock-git-graph-window-content"
      data-instance-id={instanceId ?? ""}
      data-show-embedded-git-pane-toggle={
        showEmbeddedGitPaneToggle ? "true" : "false"
      }
      data-embedded-git-pane-visible={embeddedGitPaneVisible ? "true" : "false"}
    >
      git graph
    </div>
  ),
}));

vi.mock("components/Section/Container/SectionWindowSurface", () => ({
  SectionWindowSurface: ({
    sectionId,
    chatModeOverride,
    projectChatSurfaceId,
    projectChatId,
    setProjectChatId,
  }: {
    sectionId: string;
    chatModeOverride?: string;
    projectChatSurfaceId?: string;
    projectChatId?: string | null;
    setProjectChatId?: (next: string | null) => void;
  }) => {
    const liveSectionChatId =
      mockProjectState.sections[sectionId]?.chatId ?? "";
    return (
      <div
        data-testid="mock-section-window-surface"
        data-section-id={sectionId}
        data-chat-mode-override={chatModeOverride ?? ""}
        data-project-chat-surface-id={projectChatSurfaceId ?? ""}
        data-project-chat-id={projectChatId ?? liveSectionChatId}
        data-project-chat-controlled={setProjectChatId ? "true" : "false"}
      >
        {sectionId}
      </div>
    );
  },
}));

describe("StandaloneWindowSpaceSurface", () => {
  beforeEach(() => {
    hoisted.blockedErrorCode = null;
    mockProjectState = {
      projectConfig: {
        id: "project-1",
      },
      sections: {
        "section-1": { name: "Research Notes", chatId: "workspace-thread" },
      },
    };
  });

  it("renders saved project chat, git graph, and section windows", () => {
    const markup = renderToStaticMarkup(
      <StandaloneWindowSpaceSurface
        canUseManagedChat={true}
        managedChatAuthorityState={EMPTY_MANAGED_CHAT_AUTHORITY_STATE}
        windowSpace={createWindowSpaceConfig({
          id: "space-id",
          name: "Research Board",
          windowsById: {
            "chat-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
              sectionIdOrNull: null,
              mode: ChatWindowModeEnum.project_ai_mode,
              title: "Research Chat",
              chatId: "chat-window-1",
              zIndex: 1,
              normalizedBounds: {
                x: 0,
                y: 0,
                width: 0.5,
                height: 0.5,
              },
            },
            "graph-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
              sectionIdOrNull: null,
              mode: ChatWindowModeEnum.git_graph_mode,
              title: null,
              chatId: null,
              embeddedGitPaneVisible: true,
              zIndex: 2,
              normalizedBounds: {
                x: 0,
                y: 0.5,
                width: 0.5,
                height: 0.5,
              },
            },
            "section-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.section,
              sectionIdOrNull: "section-1",
              mode: ChatWindowModeEnum.section_mode,
              title: null,
              chatId: null,
              zIndex: 3,
              normalizedBounds: {
                x: 0.5,
                y: 0,
                width: 0.5,
                height: 0.75,
              },
            },
          },
          order: ["chat-window", "graph-window", "section-window"],
        })}
      />,
    );

    expect(markup).toContain('data-testid="standalone-window-space-surface"');
    expect(markup).toContain('data-testid="standalone-window-space-window"');
    expect(markup).toContain('data-testid="mock-project-chat-window-surface"');
    expect(markup).toContain('data-testid="mock-unified-chat-surface"');
    expect(markup).toContain('data-project-chat-id="chat-window-1"');
    expect(markup).toContain(
      'data-project-chat-surface-id="standalone-window-space:project-1:space-id:chat-window"',
    );
    expect(markup).toContain('data-testid="mock-git-graph-window-content"');
    expect(markup).toContain('data-show-embedded-git-pane-toggle="true"');
    expect(markup).toContain('data-embedded-git-pane-visible="true"');
    expect(markup).toContain('data-testid="mock-section-window-surface"');
  });

  it("passes saved mode and chat identity into standalone section windows", () => {
    const markup = renderToStaticMarkup(
      <StandaloneWindowSpaceSurface
        canUseManagedChat={true}
        managedChatAuthorityState={EMPTY_MANAGED_CHAT_AUTHORITY_STATE}
        windowSpace={createWindowSpaceConfig({
          id: "space-id",
          name: "Research Board",
          windowsById: {
            "section-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.section,
              sectionIdOrNull: "section-1",
              mode: ChatWindowModeEnum.project_ai_mode,
              title: null,
              chatId: "chat-section-1",
              zIndex: 3,
              normalizedBounds: {
                x: 0,
                y: 0,
                width: 0.5,
                height: 0.75,
              },
            },
          },
          order: ["section-window"],
        })}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-window-surface"');
    expect(markup).toContain('data-chat-mode-override="project_ai_mode"');
    expect(markup).toContain(
      'data-project-chat-surface-id="standalone-window-space:project-1:space-id:section-window"',
    );
    expect(markup).toContain('data-project-chat-id="chat-section-1"');
    expect(markup).toContain('data-project-chat-controlled="true"');
  });

  it("uses the live section chat for standalone section windows in section mode", () => {
    const markup = renderToStaticMarkup(
      <StandaloneWindowSpaceSurface
        canUseManagedChat={true}
        managedChatAuthorityState={EMPTY_MANAGED_CHAT_AUTHORITY_STATE}
        windowSpace={createWindowSpaceConfig({
          id: "space-id",
          name: "Research Board",
          windowsById: {
            "section-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.section,
              sectionIdOrNull: "section-1",
              mode: ChatWindowModeEnum.section_mode,
              title: null,
              chatId: "saved-thread",
              zIndex: 3,
              normalizedBounds: {
                x: 0,
                y: 0,
                width: 0.5,
                height: 0.75,
              },
            },
          },
          order: ["section-window"],
        })}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-window-surface"');
    expect(markup).toContain('data-chat-mode-override="section_mode"');
    expect(markup).toContain('data-project-chat-id="workspace-thread"');
    expect(markup).toContain('data-project-chat-controlled="false"');
  });

  it("ignores same-layout saved section-mode chat updates", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(
          <StandaloneWindowSpaceSurface
            canUseManagedChat={true}
            managedChatAuthorityState={EMPTY_MANAGED_CHAT_AUTHORITY_STATE}
            windowSpace={createWindowSpaceConfig({
              id: "space-id",
              name: "Research Board",
              windowsById: {
                "section-window": {
                  surfaceKind: WindowSpaceSurfaceKindEnum.section,
                  sectionIdOrNull: "section-1",
                  mode: ChatWindowModeEnum.section_mode,
                  title: null,
                  chatId: "saved-thread-a",
                  zIndex: 3,
                  normalizedBounds: {
                    x: 0,
                    y: 0,
                    width: 0.5,
                    height: 0.75,
                  },
                },
              },
              order: ["section-window"],
            })}
          />,
        );
      });

      expect(
        host
          .querySelector('[data-testid="mock-section-window-surface"]')
          ?.getAttribute("data-project-chat-id"),
      ).toBe("workspace-thread");

      act(() => {
        root.render(
          <StandaloneWindowSpaceSurface
            canUseManagedChat={true}
            managedChatAuthorityState={EMPTY_MANAGED_CHAT_AUTHORITY_STATE}
            windowSpace={createWindowSpaceConfig({
              id: "space-id",
              name: "Research Board",
              windowsById: {
                "section-window": {
                  surfaceKind: WindowSpaceSurfaceKindEnum.section,
                  sectionIdOrNull: "section-1",
                  mode: ChatWindowModeEnum.section_mode,
                  title: null,
                  chatId: "saved-thread-b",
                  zIndex: 3,
                  normalizedBounds: {
                    x: 0,
                    y: 0,
                    width: 0.5,
                    height: 0.75,
                  },
                },
              },
              order: ["section-window"],
            })}
          />,
        );
      });

      expect(
        host
          .querySelector('[data-testid="mock-section-window-surface"]')
          ?.getAttribute("data-project-chat-id"),
      ).toBe("workspace-thread");
    } finally {
      act(() => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("renders only one standalone section host when saved data duplicates a section binding", () => {
    const markup = renderToStaticMarkup(
      <StandaloneWindowSpaceSurface
        canUseManagedChat={true}
        managedChatAuthorityState={EMPTY_MANAGED_CHAT_AUTHORITY_STATE}
        windowSpace={createWindowSpaceConfig({
          id: "space-id",
          name: "Research Board",
          windowsById: {
            "section-window-a": {
              surfaceKind: WindowSpaceSurfaceKindEnum.section,
              sectionIdOrNull: "section-1",
              mode: ChatWindowModeEnum.section_mode,
              title: null,
              chatId: null,
              zIndex: 1,
              normalizedBounds: {
                x: 0,
                y: 0,
                width: 0.5,
                height: 0.75,
              },
            },
            "section-window-b": {
              surfaceKind: WindowSpaceSurfaceKindEnum.section,
              sectionIdOrNull: "section-1",
              mode: ChatWindowModeEnum.project_ai_mode,
              title: null,
              chatId: "chat-section-1",
              zIndex: 3,
              normalizedBounds: {
                x: 0.5,
                y: 0,
                width: 0.5,
                height: 0.75,
              },
            },
          },
          order: ["section-window-a", "section-window-b"],
        })}
      />,
    );

    expect(
      markup.match(/data-testid="mock-section-window-surface"/g),
    ).toHaveLength(1);
    expect(markup).toContain('data-chat-mode-override="project_ai_mode"');
    expect(markup).toContain('data-project-chat-id="chat-section-1"');
  });

  it("renders shared resize handles for snapped window-space layouts", () => {
    const markup = renderToStaticMarkup(
      <StandaloneWindowSpaceSurface
        canUseManagedChat={true}
        managedChatAuthorityState={EMPTY_MANAGED_CHAT_AUTHORITY_STATE}
        windowSpace={createWindowSpaceConfig({
          id: "space-id",
          name: "Research Board",
          windowsById: {
            "left-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
              sectionIdOrNull: null,
              mode: ChatWindowModeEnum.project_ai_mode,
              title: null,
              chatId: null,
              zIndex: 1,
              normalizedBounds: {
                x: 0,
                y: 0,
                width: 0.5,
                height: 1,
              },
            },
            "right-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
              sectionIdOrNull: null,
              mode: ChatWindowModeEnum.project_ai_mode,
              title: null,
              chatId: null,
              zIndex: 2,
              normalizedBounds: {
                x: 0.5,
                y: 0,
                width: 0.5,
                height: 1,
              },
            },
          },
          order: ["left-window", "right-window"],
        })}
      />,
    );

    expect(markup).toContain(
      'data-testid="standalone-window-space-resize-handle"',
    );
    expect(markup).toContain('data-resize-axis="vertical"');
    expect(markup).toContain("z-index:24");
  });

  it("shows an empty-state message when the saved space has no windows", () => {
    const markup = renderToStaticMarkup(
      <StandaloneWindowSpaceSurface
        canUseManagedChat={true}
        managedChatAuthorityState={EMPTY_MANAGED_CHAT_AUTHORITY_STATE}
        windowSpace={createWindowSpaceConfig({
          id: "space-id",
          name: "Research Board",
          windowsById: {},
          order: [],
        })}
      />,
    );

    expect(markup).toContain(
      "This window space does not have any saved floating windows.",
    );
  });

  it("keeps scriptable and git windows visible while filtering managed windows", () => {
    const { state, managedSectionId, scriptableSectionId } =
      createManagedChatAuthorityState();
    mockProjectState = {
      projectConfig: {
        id: "project-1",
      },
      sections: {
        [managedSectionId]: { name: "Managed Chat" },
        [scriptableSectionId]: { name: "Scriptable Chat" },
      },
    };

    const markup = renderToStaticMarkup(
      <StandaloneWindowSpaceSurface
        canUseManagedChat={false}
        managedChatAuthorityState={state}
        windowSpace={createWindowSpaceConfig({
          id: "space-id",
          name: "Research Board",
          windowsById: {
            "managed-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
              sectionIdOrNull: null,
              mode: ChatWindowModeEnum.project_ai_mode,
              title: "Managed Project Chat",
              chatId: "managed-chat-id",
              zIndex: 1,
              normalizedBounds: {
                x: 0,
                y: 0,
                width: 0.33,
                height: 0.5,
              },
            },
            "scriptable-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.section,
              sectionIdOrNull: scriptableSectionId,
              mode: ChatWindowModeEnum.section_mode,
              title: "Scriptable Section Chat",
              chatId: null,
              zIndex: 2,
              normalizedBounds: {
                x: 0.33,
                y: 0,
                width: 0.33,
                height: 0.5,
              },
            },
            "git-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
              sectionIdOrNull: null,
              mode: ChatWindowModeEnum.git_graph_mode,
              title: "Git Graph",
              chatId: null,
              zIndex: 3,
              normalizedBounds: {
                x: 0.66,
                y: 0,
                width: 0.34,
                height: 0.5,
              },
            },
          },
          order: ["managed-window", "scriptable-window", "git-window"],
        })}
      />,
    );

    expect(markup).toContain('data-testid="standalone-window-space-surface"');
    expect(markup).toContain('data-testid="mock-section-window-surface"');
    expect(markup).toContain('data-testid="mock-git-graph-window-content"');
    expect(markup).not.toContain("Managed Project Chat");
    expect(markup).not.toContain(
      'data-testid="standalone-managed-chat-blocked"',
    );
  });

  it("shows the managed-chat block when every saved window is filtered out", () => {
    const markup = renderToStaticMarkup(
      <StandaloneWindowSpaceSurface
        canUseManagedChat={false}
        managedChatAuthorityState={EMPTY_MANAGED_CHAT_AUTHORITY_STATE}
        windowSpace={createWindowSpaceConfig({
          id: "space-id",
          name: "Research Board",
          windowsById: {
            "managed-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
              sectionIdOrNull: null,
              mode: ChatWindowModeEnum.project_ai_mode,
              title: "Managed Project Chat",
              chatId: "managed-chat-id",
              zIndex: 1,
              normalizedBounds: {
                x: 0,
                y: 0,
                width: 1,
                height: 1,
              },
            },
          },
          order: ["managed-window"],
        })}
      />,
    );

    expect(markup).toContain('data-testid="standalone-managed-chat-blocked"');
    expect(markup).toContain("Managed Chat Unavailable");
    expect(markup).not.toContain(
      'data-testid="standalone-window-space-window"',
    );
  });

  it("clears window-local managed-chat denial state when the owning project changes", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    hoisted.blockedErrorCode = "llm_disallowed";
    const sourceWindowSpace = createWindowSpaceConfig({
      id: "space-id",
      name: "Research Board",
      windowsById: {
        win: {
          surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
          sectionIdOrNull: null,
          mode: ChatWindowModeEnum.project_ai_mode,
          title: "Workspace Chat",
          chatId: "shared-thread",
          zIndex: 1,
          normalizedBounds: {
            x: 0,
            y: 0,
            width: 0.5,
            height: 0.5,
          },
        },
      },
      order: ["win"],
    });

    try {
      act(() => {
        root.render(
          <StandaloneWindowSpaceSurface
            windowSpace={sourceWindowSpace}
            canUseManagedChat={true}
            managedChatAuthorityState={EMPTY_MANAGED_CHAT_AUTHORITY_STATE}
          />,
        );
      });

      expect(
        host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
      ).not.toBeNull();

      hoisted.blockedErrorCode = null;
      mockProjectState = {
        projectConfig: {
          id: "project-2",
        },
        sections: {},
      };

      act(() => {
        root.render(
          <StandaloneWindowSpaceSurface
            windowSpace={sourceWindowSpace}
            canUseManagedChat={true}
            managedChatAuthorityState={EMPTY_MANAGED_CHAT_AUTHORITY_STATE}
          />,
        );
      });

      expect(
        host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
      ).toBeNull();
      expect(
        host.querySelector('[data-testid="mock-unified-chat-surface"]'),
      ).not.toBeNull();
    } finally {
      act(() => {
        root.unmount();
      });
      host.remove();
      hoisted.blockedErrorCode = null;
    }
  });

  it("resets standalone git-pane visibility when a different saved space reuses the same window id", () => {
    const previousHydratedWindowsById = {
      "graph-window": {
        instanceId: "graph-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.git_graph_mode,
        title: "Git Graph",
        chatId: null,
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 900,
          height: 520,
        },
      },
    };
    const currentWindowsById = {
      "graph-window": {
        ...previousHydratedWindowsById["graph-window"],
        embeddedGitPaneVisible: true,
      },
    };
    const nextHydratedWindowsById = {
      "graph-window": {
        ...previousHydratedWindowsById["graph-window"],
      },
    };

    expect(
      applyStandaloneWindowSpaceHydration({
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
        previousHydrationKey: "project-a:space-a",
        nextHydrationKey: "project-a:space-b",
      }),
    ).toEqual({
      nextLocalWindowsById: nextHydratedWindowsById,
      nextPreviousHydratedWindowsById: nextHydratedWindowsById,
      nextHydrationKey: "project-a:space-b",
      resetLocalState: true,
    });
  });

  it("preserves local chat ids and resized bounds when hydration only changes presentation", () => {
    const previousHydratedWindowsById = {
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Research Chat",
        chatId: "chat-window-1",
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 900,
          height: 520,
        },
      },
    };
    const currentWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        chatId: "chat-window-2",
        zIndex: 7,
        bounds: {
          x: 12,
          y: 24,
          width: 840,
          height: 460,
        },
      },
    };
    const nextHydratedWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        title: "Renamed Chat",
        bounds: {
          x: 0,
          y: 0,
          width: 720,
          height: 440,
        },
      },
    };

    expect(
      mergeHydratedStandaloneWindows(
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
      ),
    ).toEqual({
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Renamed Chat",
        chatId: "chat-window-2",
        embeddedGitPaneVisible: false,
        zIndex: 7,
        bounds: {
          x: 12,
          y: 24,
          width: 840,
          height: 460,
        },
      },
    });
  });

  it("adopts the saved chat id when the standalone window did not diverge locally", () => {
    const previousHydratedWindowsById = {
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Research Chat",
        chatId: "chat-a",
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 900,
          height: 520,
        },
      },
    };
    const currentWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
      },
    };
    const nextHydratedWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        chatId: "chat-b",
      },
    };

    expect(
      mergeHydratedStandaloneWindows(
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
      ),
    ).toEqual({
      "chat-window": {
        ...nextHydratedWindowsById["chat-window"],
      },
    });
  });

  it("adopts saved git-pane visibility when the standalone window did not diverge locally", () => {
    const previousHydratedWindowsById = {
      "graph-window": {
        instanceId: "graph-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.git_graph_mode,
        title: "Git Graph",
        chatId: null,
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 900,
          height: 520,
        },
      },
    };
    const currentWindowsById = {
      "graph-window": {
        ...previousHydratedWindowsById["graph-window"],
      },
    };
    const nextHydratedWindowsById = {
      "graph-window": {
        ...previousHydratedWindowsById["graph-window"],
        embeddedGitPaneVisible: true,
      },
    };

    expect(
      mergeHydratedStandaloneWindows(
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
      ),
    ).toEqual({
      "graph-window": {
        ...nextHydratedWindowsById["graph-window"],
      },
    });
  });

  it("adopts the saved z-index when the standalone window did not diverge locally", () => {
    const previousHydratedWindowsById = {
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Research Chat",
        chatId: "chat-a",
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 900,
          height: 520,
        },
      },
    };
    const currentWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
      },
    };
    const nextHydratedWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        zIndex: 7,
      },
    };

    expect(
      mergeHydratedStandaloneWindows(
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
      ),
    ).toEqual({
      "chat-window": {
        ...nextHydratedWindowsById["chat-window"],
      },
    });
  });

  it("preserves a locally diverged z-index during same-layout hydration", () => {
    const previousHydratedWindowsById = {
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Research Chat",
        chatId: "chat-a",
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 900,
          height: 520,
        },
      },
    };
    const currentWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        zIndex: 9,
      },
    };
    const nextHydratedWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        zIndex: 3,
      },
    };

    expect(
      mergeHydratedStandaloneWindows(
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
      ),
    ).toEqual({
      "chat-window": {
        ...nextHydratedWindowsById["chat-window"],
        zIndex: 9,
      },
    });
  });

  it("resets owner-local chat and git state when the same window id is rebound", () => {
    const previousHydratedWindowsById = {
      win: {
        instanceId: "win",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Workspace Chat",
        chatId: "saved-project-chat",
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 900,
          height: 520,
        },
      },
    };
    const currentWindowsById = {
      win: {
        ...previousHydratedWindowsById.win,
        chatId: "chat-local-override",
        embeddedGitPaneVisible: true,
        zIndex: 7,
      },
    };
    const nextHydratedWindowsById = {
      win: {
        instanceId: "win",
        surfaceKind: WindowSpaceSurfaceKindEnum.section,
        sectionIdOrNull: "section-1",
        mode: ChatWindowModeEnum.section_mode,
        title: "Research Notes",
        chatId: null,
        embeddedGitPaneVisible: false,
        zIndex: 2,
        bounds: {
          x: 40,
          y: 24,
          width: 640,
          height: 420,
        },
      },
    };

    expect(
      mergeHydratedStandaloneWindows(
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
      ),
    ).toEqual(nextHydratedWindowsById);
  });

  it("rebinds standalone windows to the new owner state instead of preserving a stale local chat override", () => {
    const initialWindowSpace = createWindowSpaceConfig({
      id: "space-id",
      name: "Research Board",
      windowsById: {
        win: {
          surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
          sectionIdOrNull: null,
          mode: ChatWindowModeEnum.project_ai_mode,
          title: "Workspace Chat",
          chatId: "saved-project-chat",
          zIndex: 1,
          normalizedBounds: {
            x: 0,
            y: 0,
            width: 0.5,
            height: 0.5,
          },
        },
      },
      order: ["win"],
    });
    const reboundWindowSpace = createWindowSpaceConfig({
      id: "space-id",
      name: "Research Board",
      windowsById: {
        win: {
          surfaceKind: WindowSpaceSurfaceKindEnum.section,
          sectionIdOrNull: "section-1",
          mode: ChatWindowModeEnum.project_ai_mode,
          title: "Research Notes",
          chatId: "saved-section-chat",
          zIndex: 1,
          normalizedBounds: {
            x: 0,
            y: 0,
            width: 0.5,
            height: 0.5,
          },
        },
      },
      order: ["win"],
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(
          <StandaloneWindowSpaceSurface
            windowSpace={initialWindowSpace}
            canUseManagedChat={true}
            managedChatAuthorityState={EMPTY_MANAGED_CHAT_AUTHORITY_STATE}
          />,
        );
      });

      const overrideButton = host.querySelector(
        '[data-testid="mock-set-project-chat-id"]',
      ) as HTMLButtonElement | null;
      if (!overrideButton) {
        throw new Error("Expected mocked standalone project chat control.");
      }

      act(() => {
        overrideButton.click();
      });

      expect(
        host
          .querySelector('[data-testid="mock-unified-chat-surface"]')
          ?.getAttribute("data-project-chat-id"),
      ).toBe("chat-local-override");

      act(() => {
        root.render(
          <StandaloneWindowSpaceSurface
            windowSpace={reboundWindowSpace}
            canUseManagedChat={true}
            managedChatAuthorityState={EMPTY_MANAGED_CHAT_AUTHORITY_STATE}
          />,
        );
      });

      expect(
        host
          .querySelector('[data-testid="mock-section-window-surface"]')
          ?.getAttribute("data-project-chat-id"),
      ).toBe("saved-section-chat");
    } finally {
      act(() => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("preserves local chat and git state when the same saved window space rehydrates", () => {
    const previousHydratedWindowsById = {
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Research Chat",
        chatId: "chat-window-1",
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 900,
          height: 520,
        },
      },
    };
    const currentWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        chatId: "chat-local-override",
        embeddedGitPaneVisible: true,
        zIndex: 7,
      },
    };
    const nextHydratedWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        title: "Renamed Chat",
        embeddedGitPaneVisible: false,
        bounds: {
          x: 0,
          y: 0,
          width: 720,
          height: 440,
        },
      },
    };

    expect(
      applyStandaloneWindowSpaceHydration({
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
        previousHydrationKey: "project-a:space-id",
        nextHydrationKey: "project-a:space-id",
      }),
    ).toEqual({
      nextLocalWindowsById: {
        "chat-window": {
          instanceId: "chat-window",
          surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
          sectionIdOrNull: null,
          mode: ChatWindowModeEnum.project_ai_mode,
          title: "Renamed Chat",
          chatId: "chat-local-override",
          embeddedGitPaneVisible: true,
          zIndex: 7,
          bounds: {
            x: 0,
            y: 0,
            width: 720,
            height: 440,
          },
        },
      },
      nextPreviousHydratedWindowsById: nextHydratedWindowsById,
      nextHydrationKey: "project-a:space-id",
      resetLocalState: false,
    });
  });

  it("resets standalone local state when the owning project config changes", () => {
    const previousHydratedWindowsById = {
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Research Chat",
        chatId: null,
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 900,
          height: 520,
        },
      },
    };
    const currentWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        chatId: "chat-local-override",
        embeddedGitPaneVisible: true,
        bounds: {
          x: 24,
          y: 40,
          width: 780,
          height: 420,
        },
      },
    };
    const nextHydratedWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        chatId: "copied-config-chat",
        bounds: {
          x: 8,
          y: 16,
          width: 640,
          height: 360,
        },
      },
    };

    expect(
      applyStandaloneWindowSpaceHydration({
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
        previousHydrationKey: "project-a:space-id",
        nextHydrationKey: "project-b:space-id",
      }),
    ).toEqual({
      nextLocalWindowsById: nextHydratedWindowsById,
      nextPreviousHydratedWindowsById: nextHydratedWindowsById,
      nextHydrationKey: "project-b:space-id",
      resetLocalState: true,
    });
  });

  it("resets standalone local state when switching to a different saved layout", () => {
    const previousHydratedWindowsById = {
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Research Chat",
        chatId: "chat-window-1",
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 900,
          height: 520,
        },
      },
    };
    const currentWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        chatId: "chat-local-override",
      },
    };
    const nextHydratedWindowsById = {
      "other-window": {
        instanceId: "other-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Other Chat",
        chatId: "chat-window-9",
        embeddedGitPaneVisible: false,
        zIndex: 2,
        bounds: {
          x: 20,
          y: 20,
          width: 640,
          height: 420,
        },
      },
    };

    expect(
      applyStandaloneWindowSpaceHydration({
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
        previousHydrationKey: "project-a:space-id",
        nextHydrationKey: "project-a:space-id-2",
      }),
    ).toEqual({
      nextLocalWindowsById: nextHydratedWindowsById,
      nextPreviousHydratedWindowsById: nextHydratedWindowsById,
      nextHydrationKey: "project-a:space-id-2",
      resetLocalState: true,
    });
  });
});
