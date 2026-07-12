import type { PresentationIntent } from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import {
  AppShellMasterController,
  type MasterInputFocusHints,
} from "./app-shell-master-controller";

export function AppShellMasterProvider({
  children,
  focusHints,
  presentPresentationIntent,
  runtimeId,
  setta,
}: {
  children: ReactNode | ((controller: AppShellMasterController) => ReactNode);
  focusHints: MasterInputFocusHints;
  presentPresentationIntent: (intent: PresentationIntent) => Promise<{ paneId: string }>;
  runtimeId: string | null;
  setta: SettaAPI;
}) {
  const focusHintsRef = useRef(focusHints);
  focusHintsRef.current = focusHints;
  const presentPresentationIntentRef = useRef(presentPresentationIntent);
  presentPresentationIntentRef.current = presentPresentationIntent;
  const [controller] = useState(
    () =>
      new AppShellMasterController({
        createInputId: () => globalThis.crypto.randomUUID(),
        now: () => new Date(),
        readActiveInteraction: () => {
          if (!setta.master) {
            return Promise.reject(
              new Error("the desktop active master interaction boundary is unavailable"),
            );
          }
          return setta.master.readActiveInteraction();
        },
        readFocusHints: () => focusHintsRef.current,
        resolvePresentationIntent: (request) => {
          if (!setta.master) {
            return Promise.reject(
              new Error("the desktop master presentation boundary is unavailable"),
            );
          }
          return setta.master.resolvePresentation(request);
        },
        submitMasterInput: (request) => {
          if (!setta.master) {
            return Promise.reject(new Error("the desktop master input boundary is unavailable"));
          }
          return setta.master.submitInput(request);
        },
        presentPresentationIntent: (intent) => presentPresentationIntentRef.current(intent),
        waitShellInteraction: (request) => {
          if (!setta.master) {
            return Promise.reject(new Error("the desktop master state boundary is unavailable"));
          }
          return setta.master.waitInteraction(request);
        },
        waitPresentationIntent: (request) => {
          if (!setta.master) {
            return Promise.reject(
              new Error("the desktop master presentation boundary is unavailable"),
            );
          }
          return setta.master.waitPresentation(request);
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
