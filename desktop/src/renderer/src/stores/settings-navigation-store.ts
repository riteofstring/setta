import { create } from "zustand";

import type { SettingsSubtab } from "../components/settings-subtabs";

type SettingsFocusTarget = "openai_voice_connection";

export type SettingsShellRoute =
  | {
      page: "workspace";
    }
  | {
      focusTarget: SettingsFocusTarget | null;
      page: "settings";
      requestId: number;
      subtab: SettingsSubtab;
    };

interface OpenSettingsRequest {
  focusTarget?: SettingsFocusTarget | null;
  subtab?: SettingsSubtab;
}

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
  closeSettings: () => void;
  completeRequest: (requestId: number) => void;
  lastSubtab: SettingsSubtab;
  nextRequestId: number;
  openSettings: (request?: OpenSettingsRequest) => void;
  request: SettingsNavigationRequest | null;
  route: SettingsShellRoute;
  setActiveSubtab: (subtab: SettingsSubtab) => void;
  openOpenAIVoiceConnection: () => void;
}

const initialSettingsSubtab = "theme" satisfies SettingsSubtab;

export const useSettingsNavigationStore = create<SettingsNavigationStore>((set) => ({
  closeSettings: () => set({ request: null, route: { page: "workspace" } }),
  completeRequest: (requestId) =>
    set((state) =>
      state.route.page === "settings" && state.route.requestId === requestId
        ? {
            request: null,
            route: {
              ...state.route,
              focusTarget: null,
            },
          }
        : state,
    ),
  lastSubtab: initialSettingsSubtab,
  openOpenAIVoiceConnection: () =>
    set((state) => ({
      lastSubtab: "speech",
      nextRequestId: state.nextRequestId + 1,
      request: {
        focusTarget: "openai_voice_connection",
        requestId: state.nextRequestId,
        subtab: "speech",
      },
      route: {
        focusTarget: "openai_voice_connection",
        page: "settings",
        requestId: state.nextRequestId,
        subtab: "speech",
      },
    })),
  openSettings: (request = {}) =>
    set((state) => {
      const subtab = request.subtab ?? state.lastSubtab;
      const navigationRequest = {
        focusTarget: request.focusTarget ?? null,
        requestId: state.nextRequestId,
        subtab,
      };
      return {
        lastSubtab: subtab,
        nextRequestId: state.nextRequestId + 1,
        request: navigationRequest,
        route: {
          ...navigationRequest,
          page: "settings",
        },
      };
    }),
  nextRequestId: 1,
  request: null,
  route: { page: "workspace" },
  setActiveSubtab: (subtab) =>
    set((state) => ({
      lastSubtab: subtab,
      request: null,
      route:
        state.route.page === "settings"
          ? {
              ...state.route,
              focusTarget: null,
              subtab,
            }
          : state.route,
    })),
}));

export function requestOpenAIVoiceConnectionSettings(): void {
  useSettingsNavigationStore.getState().openOpenAIVoiceConnection();
}

export function completeSettingsNavigationRequest(requestId: number): void {
  useSettingsNavigationStore.getState().completeRequest(requestId);
}
