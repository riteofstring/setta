import { readFileSync } from "node:fs";

import {
  getCurrEffectiveSectionImplOfType,
  processProjectStateUpdateFromBackend,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  markChatStreamActive,
  resetStreamingTracker,
} from "state/aiStreamingTracker";
import { useAIStore, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyHydratedChatDetailsToStore } from "./chatDetailsAuthority";

const chatId = "chat-1";
const projectConfigId = "project-1";
const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";
const MANAGED_CHAT_HYDRATION_AUTHORITY_FIXTURE_PATH = new URL(
  "../../../../tests/fixtures/llm/managed_chat_hydration_authority_cases.json",
  import.meta.url,
);

type ManagedChatHydrationAuthorityCase = {
  name: string;
  preserveLocalOverlay: boolean;
  localState: {
    messages: Array<Record<string, unknown>>;
    waitingForResponse: boolean;
    toolCallArguments: Record<string, string>;
  };
  backendState: {
    messages: Array<Record<string, unknown>>;
    waitingForResponse: boolean;
    toolCallArguments: Record<string, string>;
  };
  expectedState: {
    messages: Array<Record<string, unknown>>;
    waitingForResponse: boolean;
    toolCallArguments: Record<string, string>;
  };
};

const MANAGED_CHAT_HYDRATION_AUTHORITY_CASES = (
  JSON.parse(
    readFileSync(MANAGED_CHAT_HYDRATION_AUTHORITY_FIXTURE_PATH, "utf-8"),
  ) as {
    cases: ManagedChatHydrationAuthorityCase[];
  }
).cases;

function cloneContractValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stripMessageCreatedAt(
  message: Record<string, unknown>,
): Record<string, unknown> {
  const { createdAt: _createdAt, ...rest } = message;
  return rest;
}

function seedManagedChatSection() {
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
    createUserDefaultChatSectionImpl({ chatId }),
    {
      id: implId,
      chatId,
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

describe("managed chat hydration authority contract", () => {
  beforeEach(() => {
    resetProjectStores();
    resetStreamingTracker();
    seedManagedChatSection();
  });

  afterEach(() => {
    resetProjectStores();
    resetStreamingTracker();
  });

  it.each(MANAGED_CHAT_HYDRATION_AUTHORITY_CASES)(
    "chat details hydrate matches authority fixture $name",
    (fixtureCase) => {
      useAIStore.setState({
        chatDetails: {
          [chatId]: {
            messages: cloneContractValue(fixtureCase.localState.messages),
            toolCallArguments: cloneContractValue(
              fixtureCase.localState.toolCallArguments,
            ),
            waitingForResponse: fixtureCase.localState.waitingForResponse,
            llmConfig: null,
            contextUsage: null,
          },
        },
      });
      if (fixtureCase.preserveLocalOverlay) {
        markChatStreamActive(chatId, null);
      }

      applyHydratedChatDetailsToStore({
        chatId,
        messages: cloneContractValue(
          fixtureCase.backendState.messages,
        ) as never,
        waitingForResponse: fixtureCase.backendState.waitingForResponse,
        backendToolCallArguments: cloneContractValue(
          fixtureCase.backendState.toolCallArguments,
        ),
        llmConfig: null,
        contextUsage: null,
        serializedAppGenerationByMessageId: {},
      });

      const details = useAIStore.getState().chatDetails[chatId];
      expect({
        messages: details.messages.map((message) =>
          stripMessageCreatedAt(message as Record<string, unknown>),
        ),
        waitingForResponse: details.waitingForResponse,
        toolCallArguments: details.toolCallArguments ?? {},
      }).toEqual(fixtureCase.expectedState);
    },
  );

  it.each(MANAGED_CHAT_HYDRATION_AUTHORITY_CASES)(
    "section projection refresh matches authority fixture $name",
    (fixtureCase) => {
      useProjectState.setState((state) => {
        const impl = state.sectionImpls[implId];
        if (!impl || impl.type !== SectionTypeEnum.Chat) {
          return;
        }
        impl.messages = cloneContractValue(fixtureCase.localState.messages);
        impl.toolCallArguments = cloneContractValue(
          fixtureCase.localState.toolCallArguments,
        );
        impl.waitingForResponse = fixtureCase.localState.waitingForResponse;
        impl.inputText = "Local draft";
      });
      if (fixtureCase.preserveLocalOverlay) {
        markChatStreamActive(chatId, sectionId);
      }

      const backendState = JSON.parse(
        JSON.stringify(useProjectState.getState()),
      );
      setCurrEffectiveSectionImplValue<"ChatSection">(backendState, sectionId, {
        messages: cloneContractValue(
          fixtureCase.backendState.messages,
        ) as never,
        toolCallArguments: cloneContractValue(
          fixtureCase.backendState.toolCallArguments,
        ),
        waitingForResponse: fixtureCase.backendState.waitingForResponse,
        inputText: "Backend stale draft",
      });

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
      expect({
        messages: impl.messages.map((message) =>
          stripMessageCreatedAt(message as Record<string, unknown>),
        ),
        waitingForResponse: impl.waitingForResponse,
        toolCallArguments: impl.toolCallArguments ?? {},
      }).toEqual(fixtureCase.expectedState);
      expect(impl.inputText).toBe("Local draft");
    },
  );
});
