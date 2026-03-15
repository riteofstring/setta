import { type SettingsState } from "utils/generatedTypes";
import { persist } from "zustand/middleware";
import { createWithEqualityFn } from "zustand/traditional";
import { getPersistStorage } from "../storePersistStorage";
import {
  partializeUIPreferenceState,
  sanitizePersistedUIPreferenceState,
} from "./uiPreferencePersistence";
import {
  createDefaultUIPreferenceState,
  type UIPreferenceState,
} from "./uiPreferenceState";

export type {
  ColorModePreference,
  HomeProjectGalleryViewMode,
  UIPreferenceState,
} from "./uiPreferenceState";

export const useSettings = createWithEqualityFn<SettingsState>(() => ({}));

export const useLocalStorage = createWithEqualityFn(
  persist<UIPreferenceState>(createDefaultUIPreferenceState, {
    name: "setta_data",
    merge: sanitizePersistedUIPreferenceState,
    partialize: partializeUIPreferenceState,
    storage: getPersistStorage(),
  }),
);
