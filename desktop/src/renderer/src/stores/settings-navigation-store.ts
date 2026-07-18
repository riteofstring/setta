import { create } from "zustand";

import type { SettingsSubtab } from "../components/settings-subtabs";

type SettingsFocusTarget = "openai_voice_connection";

interface SettingsNavigationRequest {
  focusTarget: SettingsFocusTarget | null;
  requestId: number;
  subtab: SettingsSubtab;
}

export interface SettingsFocusRequest {
  requestId: number;
  target: SettingsFocusTarget;
}

interface SettingsNavigationStore {
  completeRequest: (requestId: number) => void;
  nextRequestId: number;
  request: SettingsNavigationRequest | null;
  openOpenAIVoiceConnection: () => void;
}

export const useSettingsNavigationStore = create<SettingsNavigationStore>((set) => ({
  completeRequest: (requestId) =>
    set((state) =>
      state.request?.requestId === requestId
        ? {
            request: null,
          }
        : state,
    ),
  openOpenAIVoiceConnection: () =>
    set((state) => ({
      nextRequestId: state.nextRequestId + 1,
      request: {
        focusTarget: "openai_voice_connection",
        requestId: state.nextRequestId,
        subtab: "speech",
      },
    })),
  nextRequestId: 1,
  request: null,
}));

export function requestOpenAIVoiceConnectionSettings(): void {
  useSettingsNavigationStore.getState().openOpenAIVoiceConnection();
}

export function completeSettingsNavigationRequest(requestId: number): void {
  useSettingsNavigationStore.getState().completeRequest(requestId);
}
