import { getCurrEffectiveSectionImplOfType, processProjectStateUpdateFromBackend } from "state/actions/sectionInfos";
import { usePendingOperations, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatRoleEnum,
  SectionTypeEnum,
  createChatSectionImpl,
  createCore,
  createMessageTextContent,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let persistChatSectionState: typeof import("./ai").persistChatSectionState;

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_set_chat_section_state: vi.fn(),
  };
});

const projectConfigId = "project-1";
const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";

function seedChatSection() {
  const sectionCore = createCore({
    id: sectionId,
    name: "Chat",
    variants: [variantId],
    defaultVariant: variantId,
  });
  const sectionVariant = createVariant({
    id: variantId,
    name: "Chat Variant",
    impl: implId,
    nonPresetImpls: [],
  });
  const sectionImpl = createChatSectionImpl(
    createUserDefaultChatSectionImpl({ chatId: null }),
    {
      id: implId,
      chatId: null,
      managed: true,
      engineConfigId: "engine-1",
      thinking: true,
    },
  );
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({ id: projectConfigId });
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: sectionImpl };
    state.projectConfig.sectionVariantMap = { [sectionId]: variantId };
    state.previewSectionVariantMap = {};
  });
}

describe("chat section state persistence during backend updates", () => {
  beforeAll(async () => {
    persistChatSectionState = (await import("./ai")).persistChatSectionState;
  });

  beforeEach(() => {
    resetProjectStores();
    seedChatSection();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it("reapplies pending chat state over backend updates (e.g., resize)", async () => {
    const route_set_chat_section_state =
      (await import("utils/generatedEndpoints")).route_set_chat_section_state as unknown as vi.Mock;
    route_set_chat_section_state.mockReturnValue(new Promise(() => {}));

    const nextState = {
      messages: [
        {
          id: "msg-1",
          role: ChatRoleEnum.user,
          content: [createMessageTextContent({ text: "Hello" })],
          attachments: [],
        },
      ],
      inputText: "",
      waitingForResponse: true,
      toolCallArguments: {},
    };

    persistChatSectionState({
      sectionId,
      nextState,
      reason: "test",
    });

    expect(usePendingOperations.getState().pending.length).toBe(1);

    const backendState = JSON.parse(JSON.stringify(useProjectState.getState()));
    backendState.sectionImpls[implId].messages = [];
    backendState.sectionImpls[implId].inputText = "";
    backendState.sectionImpls[implId].waitingForResponse = false;
    backendState.sectionImpls[implId].toolCallArguments = {};

    processProjectStateUpdateFromBackend({
      projectState: backendState,
      completedOpIds: [],
      pendingOpIds: [],
    });

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    expect(
      impl.messages.some(
        (message) =>
          message.role === ChatRoleEnum.user &&
          message.content?.some(
            (content) => content.type === "text" && content.text === "Hello",
          ),
      ),
    ).toBe(true);
  });
});
