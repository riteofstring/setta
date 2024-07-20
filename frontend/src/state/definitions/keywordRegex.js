import { create } from "./utils";

const initialState = { pattern: "", fullNameToInfo: {} };

export const useKeywordRegex = create(() => ({
  ...initialState,
}));
