import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SectionTypeEnum } from "utils/generatedTypes";
import { vi } from "vitest";

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
    windowSpaceIdsBySlug?: Record<string, Array<string>>;
    sectionVariantMap: Record<string, string>;
    sectionIdsByPathSlug?: Record<string, Array<string>>;
  };
  sections: Record<string, MockSectionCore>;
  sectionVariants: Record<string, MockSectionVariant>;
  sectionImpls: Record<string, MockSectionImpl>;
  parentSectionMap: Record<string, string | null>;
};

type MockAIState = {
  activeChatId: string | null | undefined;
  agentRuns: Array<unknown>;
  agentRunsAuthorityState: string;
  chatDetails: Record<string, unknown>;
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
        windowSpaceIdsBySlug: {},
        sectionVariantMap: {},
        sectionIdsByPathSlug: {},
      },
      sections: {},
      sectionVariants: {},
      sectionImpls: {},
      parentSectionMap: {},
    } as MockProjectState,
    aiState: {
      activeChatId: "workspace-chat",
      agentRuns: [],
      agentRunsAuthorityState: "ready",
      chatDetails: {},
    } as MockAIState,
    shareSessionState: {
      isDeploymentMode: false,
      sharePolicy: null,
    } as MockShareSessionState,
    projectChatBlockedErrorCode: null as string | null,
    chatHistoryEntries: [] as Array<{ chatId: string; label: string }>,
    loadProjectConfigResult: [true, false] as [boolean, boolean],
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
      setState: (
        updater:
          | Partial<MockAIState>
          | ((nextState: MockAIState) => Partial<MockAIState>),
      ) => {
        const nextState =
          typeof updater === "function" ? updater(state.aiState) : updater;
        state.aiState = {
          ...state.aiState,
          ...nextState,
        };
      },
    },
  );

  const useShareSessionMock = Object.assign(
    (selector: (nextState: MockShareSessionState) => unknown) =>
      selector(state.shareSessionState),
    {
      getState: () => state.shareSessionState,
    },
  );

  return {
    state,
    useProjectStateMock,
    useAIStoreMock,
    useShareSessionMock,
  };
});

export function getStandaloneProjectSurfaceMocks() {
  return hoisted;
}

vi.mock("components/ChatWindowing/UnifiedChatSurface", () => ({
  UnifiedChatSurface: ({
    dataTestId,
    projectChatId,
    setProjectChatId,
    onProjectChatBlockedErrorCodeChange,
  }: {
    dataTestId?: string | undefined;
    projectChatId?: string | null | undefined;
    setProjectChatId?: ((next: string | null) => void) | undefined;
    onProjectChatBlockedErrorCodeChange?:
      | ((errorCode: string | null) => void)
      | undefined;
  }) => (
    <MockUnifiedChatSurface
      dataTestId={dataTestId}
      projectChatId={projectChatId}
      setProjectChatId={setProjectChatId}
      onProjectChatBlockedErrorCodeChange={onProjectChatBlockedErrorCodeChange}
    />
  ),
}));

vi.mock("components/ChatWindowing/ProjectChatWindowSurface", () => ({
  ProjectChatWindowSurface: ({ children }: { children: ReactNode }) => (
    <section
      data-testid="mock-project-chat-window-frame"
      data-chat-window-frame="project-chat"
    >
      {children}
    </section>
  ),
}));

function MockUnifiedChatSurface({
  dataTestId,
  projectChatId,
  setProjectChatId,
  onProjectChatBlockedErrorCodeChange,
}: {
  dataTestId?: string | undefined;
  projectChatId?: string | null | undefined;
  setProjectChatId?: ((next: string | null) => void) | undefined;
  onProjectChatBlockedErrorCodeChange?:
    | ((errorCode: string | null) => void)
    | undefined;
}) {
  useEffect(() => {
    onProjectChatBlockedErrorCodeChange?.(
      hoisted.state.projectChatBlockedErrorCode,
    );
  }, [
    onProjectChatBlockedErrorCodeChange,
    hoisted.state.projectChatBlockedErrorCode,
  ]);

  return (
    <div
      data-testid={dataTestId ?? "mock-unified-chat-surface"}
      data-project-chat-id={projectChatId ?? ""}
    >
      <button
        type="button"
        data-testid="mock-standalone-new-chat"
        onClick={() => {
          setProjectChatId?.(null);
        }}
      >
        New Chat
      </button>
      <button
        type="button"
        data-testid="mock-standalone-select-chat-beta"
        onClick={() => {
          setProjectChatId?.("chat-beta");
        }}
      >
        Select chat beta
      </button>
    </div>
  );
}

vi.mock("components/Section/Container/SectionWindowSurface", () => ({
  SectionWindowSurface: ({
    bodyOverride,
    onProjectChatBlockedErrorCodeChange,
  }: {
    bodyOverride?: ReactNode | undefined;
    onProjectChatBlockedErrorCodeChange?:
      | ((errorCode: string | null) => void)
      | undefined;
  }) => {
    useEffect(() => {
      onProjectChatBlockedErrorCodeChange?.(
        hoisted.state.projectChatBlockedErrorCode,
      );
    }, [
      onProjectChatBlockedErrorCodeChange,
      hoisted.state.projectChatBlockedErrorCode,
    ]);
    return (
      <div
        data-testid="mock-section-window-surface"
        data-has-body-override={String(bodyOverride !== undefined)}
      />
    );
  },
}));

vi.mock("components/Utils/FloatingBox", () => ({
  FloatingBox: () => <div data-testid="mock-floating-box" />,
}));

vi.mock("gpuFlow/mouseLocation", () => ({
  useAddMouseLocationListener: () => undefined,
}));

vi.mock("plugins/runtime", () => ({
  usePluginRuntimeBootstrap: () => undefined,
}));

vi.mock("components/Utils/CodeMirror/useCodeMirrorStyleLoader", () => ({
  useCodeMirrorStyleLoader: () => undefined,
}));

vi.mock("state/actions/chatHistory", () => ({
  buildChatHistoryEntries: () => hoisted.state.chatHistoryEntries,
}));

vi.mock("state/definitions", () => ({
  useAIStore: hoisted.useAIStoreMock,
  useProjectState: hoisted.useProjectStateMock,
  useShareSession: hoisted.useShareSessionMock,
}));

vi.mock("state/hooks/project", () => ({
  useLoadProjectConfig: () => hoisted.state.loadProjectConfigResult,
}));

vi.mock("../LoadingSpinner", () => ({
  LoadingSpinner: () => <div data-testid="mock-loading-spinner" />,
}));

vi.mock("../NotFound/NotFound", () => ({
  NotFound: ({
    title = "Not Found",
    description,
  }: {
    title?: string;
    description?: string;
  }) => (
    <div data-testid="mock-not-found">
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
  ),
}));

vi.mock("./StandaloneWindowSpaceSurface", () => ({
  StandaloneWindowSpaceSurface: ({
    onProjectChatBlockedErrorCodeChange,
  }: {
    onProjectChatBlockedErrorCodeChange?:
      | ((errorCode: string | null) => void)
      | undefined;
  }) => {
    useEffect(() => {
      onProjectChatBlockedErrorCodeChange?.(
        hoisted.state.projectChatBlockedErrorCode,
      );
    }, [
      onProjectChatBlockedErrorCodeChange,
      hoisted.state.projectChatBlockedErrorCode,
    ]);
    return <div data-testid="mock-standalone-window-space-surface" />;
  },
}));

export function resetStandaloneProjectSurfaceMocks() {
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
    activeChatId: "workspace-chat",
    agentRuns: [],
    agentRunsAuthorityState: "ready",
    chatDetails: {},
  };
  hoisted.state.shareSessionState = {
    isDeploymentMode: false,
    sharePolicy: null,
  };
  hoisted.state.projectChatBlockedErrorCode = null;
  hoisted.state.chatHistoryEntries = [
    { chatId: "chat-alpha", label: "Alpha Chat" },
    { chatId: "chat-beta", label: "Beta Chat" },
  ];
  hoisted.state.loadProjectConfigResult = [true, false];
}

export function LocationProbe() {
  const location = useLocation();
  return <div data-testid="mock-location-path">{location.pathname}</div>;
}

export function NavigateButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      data-testid={`mock-navigate-${to}`}
      onClick={() => {
        navigate(to);
      }}
    >
      Navigate
    </button>
  );
}

export function click(node: Element | null): void {
  if (!(node instanceof HTMLElement)) {
    throw new Error("Expected clickable element.");
  }
  node.click();
}

export function createChatSectionFixture({
  sectionId,
  sectionName,
  managed,
}: {
  sectionId: string;
  sectionName: string;
  managed: boolean;
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
      type: SectionTypeEnum.Chat,
      managed,
    } satisfies MockSectionImpl,
  };
}

export function createTextSectionFixture({
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

export function createGroupSectionFixture({
  sectionId,
  sectionName,
  children = [],
}: {
  sectionId: string;
  sectionName: string;
  children?: string[];
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
      type: SectionTypeEnum.Group,
      children,
    } satisfies MockSectionImpl,
  };
}
