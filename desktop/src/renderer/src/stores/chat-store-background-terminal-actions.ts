import {
  backgroundTerminalOutputErrorPatch,
  backgroundTerminalOutputLoadingPatch,
  backgroundTerminalOutputPageLoadedPatch,
  backgroundTerminalsReplacedPatch,
  backgroundTerminalUpsertPatch,
} from "./chat-store-background-terminals";
import { errorMessage, errorPatch } from "./chat-store-helpers";
import type { ChatPatch, ChatStore } from "./chat-store-types";

interface BackgroundTerminalActionDeps {
  applyPatch: (patchForState: (state: ChatStore) => ChatPatch) => void;
  get: () => ChatStore;
}

export function createChatBackgroundTerminalActions({
  applyPatch,
  get,
}: BackgroundTerminalActionDeps): Pick<
  ChatStore,
  | "killAllBackgroundTerminals"
  | "killBackgroundTerminal"
  | "loadBackgroundTerminalOutput"
  | "refreshBackgroundTerminals"
> {
  return {
    killAllBackgroundTerminals: async () => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      try {
        const projection = await window.setta.chat.killAllBackgroundTerminals(
          workspaceId,
          selectedConversation.id,
        );
        applyPatch((current) => ({
          ...backgroundTerminalsReplacedPatch(
            current,
            selectedConversation.id,
            projection.terminals,
          ),
          error: null,
          status: "ready",
        }));
      } catch (error) {
        applyPatch(() => errorPatch(error));
      }
    },
    killBackgroundTerminal: async (processId: string) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation || processId === "") {
        return;
      }
      try {
        const process = await window.setta.chat.killBackgroundTerminal(
          workspaceId,
          selectedConversation.id,
          processId,
        );
        applyPatch((current) => ({
          ...backgroundTerminalUpsertPatch(current, process),
          error: null,
          status: "ready",
        }));
      } catch (error) {
        applyPatch(() => errorPatch(error));
      }
    },
    loadBackgroundTerminalOutput: async (processId, afterOrdinal = 0, limit = 200) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation || processId === "") {
        return;
      }
      applyPatch((current) => backgroundTerminalOutputLoadingPatch(current, processId));
      try {
        const page = await window.setta.chat.getBackgroundTerminalOutput(
          workspaceId,
          selectedConversation.id,
          processId,
          afterOrdinal,
          limit,
        );
        applyPatch((current) => ({
          ...backgroundTerminalOutputPageLoadedPatch(current, {
            afterOrdinal,
            hasMore: page.hasMore,
            nextOrdinal: page.nextOrdinal,
            output: page.output,
            processId: page.processId,
          }),
          status: "ready",
        }));
      } catch (error) {
        applyPatch((current) => ({
          ...errorPatch(error),
          ...backgroundTerminalOutputErrorPatch(current, processId, errorMessage(error)),
        }));
      }
    },
    refreshBackgroundTerminals: async () => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      try {
        const projection = await window.setta.chat.listBackgroundTerminals(
          workspaceId,
          selectedConversation.id,
        );
        applyPatch((current) => ({
          ...backgroundTerminalsReplacedPatch(
            current,
            selectedConversation.id,
            projection.terminals,
          ),
          status: "ready",
        }));
      } catch (error) {
        applyPatch(() => errorPatch(error));
      }
    },
  };
}
