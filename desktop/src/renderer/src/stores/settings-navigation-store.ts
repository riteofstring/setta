import { create } from "zustand";

import type { SettingsSubtab } from "../components/settings-subtabs";

type SettingsFocusTarget =
  | "openai_voice_connection"
  | "prototype_gallery_launcher"
  | "voice_provider_selection";

export type SettingsShellRoute =
  | {
      page: "workspace";
    }
  | {
      focusTarget: SettingsFocusTarget | null;
      page: "settings";
      requestId: number;
      subtab: SettingsSubtab;
    }
  | {
      page: "prototype-gallery";
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
  openPrototypeGallery: () => void;
  openSettings: (request?: OpenSettingsRequest) => void;
  request: SettingsNavigationRequest | null;
  returnToDeveloperSettings: () => void;
  route: SettingsShellRoute;
  setActiveSubtab: (subtab: SettingsSubtab) => void;
  openOpenAIVoiceConnection: () => void;
  openVoiceProviderSelection: () => void;
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
  openPrototypeGallery: () =>
    set({
      lastSubtab: "developer",
      request: null,
      route: { page: "prototype-gallery" },
    }),
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
  openVoiceProviderSelection: () =>
    set((state) => ({
      lastSubtab: "speech",
      nextRequestId: state.nextRequestId + 1,
      request: {
        focusTarget: "voice_provider_selection",
        requestId: state.nextRequestId,
        subtab: "speech",
      },
      route: {
        focusTarget: "voice_provider_selection",
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
  returnToDeveloperSettings: () =>
    set((state) => {
      const requestId = state.nextRequestId;
      return {
        lastSubtab: "developer",
        nextRequestId: requestId + 1,
        request: {
          focusTarget: "prototype_gallery_launcher",
          requestId,
          subtab: "developer",
        },
        route: {
          focusTarget: "prototype_gallery_launcher",
          page: "settings",
          requestId,
          subtab: "developer",
        },
      };
    }),
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

export function requestVoiceProviderSelectionSettings(): void {
  useSettingsNavigationStore.getState().openVoiceProviderSelection();
}

export function completeSettingsNavigationRequest(requestId: number): void {
  useSettingsNavigationStore.getState().completeRequest(requestId);
}
