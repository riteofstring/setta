import type { SettaAPI } from "@shared/types";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { hydrateConversationProjectionSnapshot } from "../../stores/conversation-projection-runtime";
import {
  AppShellMasterController,
  type MasterConversationPresentationTarget,
  type MasterInputFocusHints,
} from "./app-shell-master-controller";

export function AppShellMasterProvider({
  children,
  focusHints,
  presentConversation,
  runtimeId,
  setta,
}: {
  children: ReactNode | ((controller: AppShellMasterController) => ReactNode);
  focusHints: MasterInputFocusHints;
  presentConversation: (
    workspaceId: string,
    conversationId: string,
    title: string,
  ) => Promise<void>;
  runtimeId: string | null;
  setta: SettaAPI;
}) {
  const focusHintsRef = useRef(focusHints);
  focusHintsRef.current = focusHints;
  const presentConversationRef = useRef(presentConversation);
  presentConversationRef.current = presentConversation;
  const [controller] = useState(
    () =>
      new AppShellMasterController({
        createInputId: () => globalThis.crypto.randomUUID(),
        now: () => new Date(),
        presentConversation: (target) =>
          presentMasterConversation(setta, presentConversationRef.current, target),
        readRecentMasterInputs: () => {
          if (!setta.master) {
            return Promise.reject(new Error("the desktop master history boundary is unavailable"));
          }
          return setta.master.readRecentInputs();
        },
        readFocusHints: () => focusHintsRef.current,
        submitMasterInput: (request) => {
          if (!setta.master) {
            return Promise.reject(new Error("the desktop master input boundary is unavailable"));
          }
          return setta.master.submitInput(request);
        },
        waitMasterInputState: (request) => {
          if (!setta.master) {
            return Promise.reject(new Error("the desktop master routing boundary is unavailable"));
          }
          return setta.master.waitInputState(request);
        },
      }),
  );
  const [effectLifetime] = useState(() => new AppShellMasterEffectLifetime());
  const content = useMemo(
    () => (typeof children === "function" ? children(controller) : children),
    [children, controller],
  );

  useEffect(() => effectLifetime.mount(controller), [controller, effectLifetime]);
  useEffect(() => controller.synchronizeRuntime(runtimeId), [controller, runtimeId]);

  return content;
}

async function presentMasterConversation(
  setta: SettaAPI,
  presentConversation: (
    workspaceId: string,
    conversationId: string,
    title: string,
  ) => Promise<void>,
  target: MasterConversationPresentationTarget,
): Promise<void> {
  const snapshot = await setta.conversations.read(target);
  if (
    snapshot.conversation.id !== target.conversationId ||
    snapshot.conversation.workspaceId !== target.workspaceId
  ) {
    throw new Error("master presentation target changed while loading its conversation");
  }
  hydrateConversationProjectionSnapshot(snapshot);
  await presentConversation(target.workspaceId, target.conversationId, snapshot.conversation.title);
}

interface PendingMasterControllerDisposal {
  canceled: boolean;
  controller: AppShellMasterController;
}

class AppShellMasterEffectLifetime {
  private pendingDisposal: PendingMasterControllerDisposal | null = null;

  mount(controller: AppShellMasterController): () => void {
    if (this.pendingDisposal?.controller === controller) {
      this.pendingDisposal.canceled = true;
      this.pendingDisposal = null;
    }
    return () => {
      const pending = { canceled: false, controller };
      this.pendingDisposal = pending;
      queueMicrotask(() => {
        if (pending.canceled) {
          return;
        }
        if (this.pendingDisposal === pending) {
          this.pendingDisposal = null;
        }
        controller.dispose();
      });
    };
  }
}
