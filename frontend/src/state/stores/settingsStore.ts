import { SettingsState } from "utils/generatedTypes";
import { createWithEqualityFn } from "zustand/traditional";

export const useSettings = createWithEqualityFn<SettingsState>(() => ({}));
