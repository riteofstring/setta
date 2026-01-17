import { ChatInput } from "components/Chat/ChatInput";
import { ChatMessageList } from "components/Chat/ChatMessages";
import { useCallback, useEffect, useState } from "react";
import {
  hydrateAgentRunChatDetails,
  primeAgentRunChatDetails,
  stopAgentRunChatDetails,
} from "state/actions/ai";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useAIStore, useProjectState } from "state/definitions";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_set_chat_section_settings,
  route_start_agent_run,
  route_stop_agent_run,
} from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";

export function ChatArea({ sectionId }: { sectionId: string }) {
  const {
    agentProfileId,
    agentRunId,
    isFrozen,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Chat,
    );
    return {
      agentProfileId: impl.agentProfileId,
      agentRunId: impl.agentRunId,
      isFrozen: impl.isFrozen,
    };
  }, shallow);

  const { ref, isScrollable } = useIsScrollable();
  const projectConfigId = getCurrProjectConfigId();
  const runChatDetails = useAIStore(
    (state) => (agentRunId ? state.chatDetails[agentRunId] : null),
    shallow,
  );
  const messages = runChatDetails?.messages ?? [];
  const waitingForResponse = runChatDetails?.waitingForResponse ?? false;
  const toolCallArguments = runChatDetails?.toolCallArguments ?? {};
  const [inputText, setInputText] = useState("");
  const [draftInputText, setDraftInputText] = useState<string | null>(null);

  useEffect(() => {
    if (!agentRunId) {
      return;
    }
    if (runChatDetails) {
      return;
    }
    void hydrateAgentRunChatDetails(agentRunId);
  }, [agentRunId, runChatDetails, hydrateAgentRunChatDetails]);

  const handleInputChange = useCallback(
    (value: string) => {
      if (waitingForResponse) {
        setDraftInputText(value);
        return;
      }
      setInputText(value);
    },
    [waitingForResponse],
  );

  useEffect(() => {
    if (waitingForResponse) {
      return;
    }
    if (draftInputText === null) {
      return;
    }
    setInputText(draftInputText);
    setDraftInputText(null);
  }, [draftInputText, waitingForResponse]);

  const updateAgentRunId = useCallback(
    async (nextRunId: string | null) => {
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
            agentRunId: nextRunId,
          });
        },
        send: (frontendOpId) =>
          route_set_chat_section_settings({
            projectConfigId,
            sectionId,
            agentProfileId,
            agentRunId: nextRunId,
            frontendOpId,
          }),
      });
    },
    [agentProfileId, projectConfigId, sectionId],
  );

  const handleSubmit = useCallback(
    async (message: string) => {
      if (!message.trim()) {
        return;
      }
      if (!agentProfileId) {
        return;
      }
      setInputText("");
      setDraftInputText(null);
      const runResult = await route_start_agent_run({
        agentProfileId,
        inputs: message,
        sectionId,
      });
      if (res200(runResult)) {
        await updateAgentRunId(runResult.data.id);
        primeAgentRunChatDetails(runResult.data);
        return;
      }
      setInputText(message);
    },
    [
      agentProfileId,
      sectionId,
      updateAgentRunId,
      primeAgentRunChatDetails,
    ],
  );

  const handleStop = useCallback(async () => {
    if (!agentRunId) {
      return;
    }
    await route_stop_agent_run({ runId: agentRunId });
    stopAgentRunChatDetails(agentRunId);
  }, [agentRunId, stopAgentRunChatDetails]);

  const scrollClassName = `${isScrollable ? NO_WHEEL_CLASS_NAME : ""} px-4`;
  const effectiveInputText =
    waitingForResponse && draftInputText !== null ? draftInputText : inputText;
  const isDisabled = isFrozen || !agentProfileId;
  const placeholderText = agentProfileId
    ? "Type a message..."
    : "Select an agent profile";

  return (
    <div className={`${NO_PAN_CLASS_NAME} section-main-full-w flex flex-col`}>
      <ChatMessageList
        messages={messages}
        waitingForResponse={waitingForResponse}
        toolCallArguments={toolCallArguments}
        className={scrollClassName}
        scrollRef={ref}
      />
      <ChatInput
        placeholderText={placeholderText}
        waitingForResponse={waitingForResponse}
        disabled={isDisabled}
        value={effectiveInputText}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        onStop={handleStop}
      />
    </div>
  );
}
