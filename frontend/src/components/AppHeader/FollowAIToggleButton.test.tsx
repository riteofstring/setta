import * as Menubar from "@radix-ui/react-menubar";
import { renderToStaticMarkup } from "react-dom/server";
import { resetProjectStores } from "state/utils";
import {
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

let FollowAIToggleButton: typeof import("./FollowAIToggleButton").FollowAIToggleButton;
let useAIStore: typeof import("state/definitions").useAIStore;
let useAIFollow: typeof import("state/definitions").useAIFollow;
let useProjectState: typeof import("state/definitions").useProjectState;
let memoryStorage: Storage;

vi.mock("@radix-ui/react-menubar", async () => {
  const React = await import("react");
  const passthrough = (Tag: React.ElementType) => {
    return ({
      children,
      align,
      sideOffset,
      alignOffset,
      ...props
    }: Record<string, unknown>) => React.createElement(Tag, props, children);
  };
  const Fragment = ({ children }) =>
    React.createElement(React.Fragment, null, children);
  return {
    Root: passthrough("div"),
    Menu: passthrough("div"),
    Trigger: passthrough("button"),
    Portal: Fragment,
    Content: passthrough("div"),
    Item: passthrough("div"),
  };
});

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

describe("FollowAIToggleButton", () => {
  const projectConfigId = "project-1";
  const chatSectionId = "section-chat";
  const chatVariantId = "variant-chat";
  const chatImplId = "impl-chat";

  const sectionCore = createCore({
    id: chatSectionId,
    name: "My Chat",
    variants: [chatVariantId],
    defaultVariant: chatVariantId,
  });

  const sectionVariant = createVariant({
    id: chatVariantId,
    name: "Chat Variant",
    impl: chatImplId,
    nonPresetImpls: [],
  });

  beforeAll(async () => {
    const storage = new Map<string, string>();
    memoryStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
    };
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage;
    const definitions = await import("state/definitions");
    useAIStore = definitions.useAIStore;
    useAIFollow = definitions.useAIFollow;
    useProjectState = definitions.useProjectState;
    FollowAIToggleButton = (await import("./FollowAIToggleButton"))
      .FollowAIToggleButton;
  });

  beforeEach(() => {
    resetProjectStores();
    memoryStorage.clear();
    useAIStore.setState({ activeChatId: undefined });
    syncStoreInitialState(useAIStore);
  });

  afterEach(() => {
    resetProjectStores();
    useAIStore.setState({ activeChatId: undefined });
    syncStoreInitialState(useAIStore);
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  function setProjectChatState(chatId: string | null) {
    const projectConfig = createProjectConfig({
      id: projectConfigId,
      sectionVariantMap: { [chatSectionId]: chatVariantId },
    });
    const chatImpl = createChatSectionImpl(
      createUserDefaultChatSectionImpl({ chatId }),
      { id: chatImplId, chatId },
    );

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [chatSectionId]: sectionCore };
      state.sectionVariants = { [chatVariantId]: sectionVariant };
      state.sectionImpls = { [chatImplId]: chatImpl };
      state.previewSectionVariantMap = {};
    });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useAIFollow);
  }

  function setEmptyProjectState() {
    const projectConfig = createProjectConfig({
      id: projectConfigId,
      sectionVariantMap: {},
    });
    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = {};
      state.sectionVariants = {};
      state.sectionImpls = {};
      state.previewSectionVariantMap = {};
    });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useAIFollow);
  }

  it("shows an empty state when no chats exist", () => {
    setEmptyProjectState();

    const markup = renderToStaticMarkup(
      <Menubar.Root>
        <FollowAIToggleButton />
      </Menubar.Root>,
    );

    expect(markup).toContain("No chats yet");
  });

  it("renders in active mode by default", () => {
    setEmptyProjectState();

    const markup = renderToStaticMarkup(
      <Menubar.Root>
        <FollowAIToggleButton />
      </Menubar.Root>,
    );

    expect(markup).toContain("text-blue-600");
  });

  it("shows chat sections without chat ids as not started", () => {
    setProjectChatState(null);

    const markup = renderToStaticMarkup(
      <Menubar.Root>
        <FollowAIToggleButton />
      </Menubar.Root>,
    );

    expect(markup).toContain("My Chat (section-)");
    expect(markup).toContain("not started");
    expect(markup).not.toContain("No chats yet");
  });

  it("lists project and section chats with selection actions", () => {
    const projectChatId = "projchat12345678";
    const sectionChatId = "sectionchat12345678";
    setProjectChatState(sectionChatId);
    useAIStore.setState({ activeChatId: projectChatId });
    syncStoreInitialState(useAIStore);
    useAIFollow.setState((state) => {
      state.mode = "selected";
      state.selectedSectionIdsByProjectConfigId[projectConfigId] = [
        chatSectionId,
      ];
    });
    syncStoreInitialState(useAIFollow);
    expect(useAIStore.getState().activeChatId).toBe(projectChatId);

    const markup = renderToStaticMarkup(
      <Menubar.Root>
        <FollowAIToggleButton />
      </Menubar.Root>,
    );

    expect(markup).toContain("Project chat (projchat)");
    expect(markup).toContain("My Chat (section-)");
    expect(markup).toContain("Clear selection");
  });

  it("uses the same responsive collapse breakpoint as project chat nav controls", () => {
    setEmptyProjectState();

    const markup = renderToStaticMarkup(
      <Menubar.Root>
        <FollowAIToggleButton />
      </Menubar.Root>,
    );

    expect(markup).toContain('data-testid="follow-ai-visible-label"');
    expect(markup).toContain("hidden @[31.25rem]:block");
    expect(markup).toContain("sr-only @[31.25rem]:hidden");
  });
});
