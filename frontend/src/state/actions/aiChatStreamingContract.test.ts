import { readFileSync } from "node:fs";

import { useAIStore, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const projectConfigId = "project-1";
const chatId = "chat-1";
const MANAGED_CHAT_STREAM_CONTRACT_FIXTURE_PATH = new URL(
  "../../../../tests/fixtures/llm/managed_chat_stream_contract_cases.json",
  import.meta.url,
);

type ManagedChatStreamContractCase = {
  name: string;
  initialState: {
    messages: Array<Record<string, unknown>>;
    waitingForResponse: boolean;
    toolCallArguments: Record<string, string>;
  };
  chunks: Array<Record<string, unknown>>;
  expectedState: {
    messages: Array<Record<string, unknown>>;
    waitingForResponse: boolean;
    toolCallArguments: Record<string, string>;
  };
};

const MANAGED_CHAT_STREAM_CONTRACT_CASES = (
  JSON.parse(
    readFileSync(MANAGED_CHAT_STREAM_CONTRACT_FIXTURE_PATH, "utf-8"),
  ) as {
    cases: ManagedChatStreamContractCase[];
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

let getDefaultChatDetails: typeof import("./ai").getDefaultChatDetails;
let receiveLLMResponseChunk: typeof import("./ai").receiveLLMResponseChunk;

describe("chat details streaming contract", () => {
  beforeAll(async () => {
    const ai = await import("./ai");
    getDefaultChatDetails = ai.getDefaultChatDetails;
    receiveLLMResponseChunk = ai.receiveLLMResponseChunk;
  });

  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: projectConfigId });
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it.each(MANAGED_CHAT_STREAM_CONTRACT_CASES)(
    "matches managed chat stream contract fixture $name",
    (fixtureCase) => {
      useAIStore.setState({
        chatDetails: {
          [chatId]: {
            ...getDefaultChatDetails(),
            messages: cloneContractValue(fixtureCase.initialState.messages),
            waitingForResponse: fixtureCase.initialState.waitingForResponse,
            toolCallArguments: cloneContractValue(
              fixtureCase.initialState.toolCallArguments,
            ),
          },
        },
      });

      for (const chunk of fixtureCase.chunks) {
        receiveLLMResponseChunk({
          chatId,
          sectionId: null,
          projectConfigId,
          chunk: cloneContractValue(chunk) as never,
        });
      }

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
});
