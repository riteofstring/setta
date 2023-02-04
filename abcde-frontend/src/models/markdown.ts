import {
  MarkdownStateType,
  MarkdownZustandType,
} from "abcde-utils/src/types/markdown";
import { immer } from "zustand/middleware/immer";
import { create } from "./utils";

const initialState: MarkdownStateType = { x: {} };

export const useMarkdown = create(
  immer<MarkdownZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll(payload);
    },
    setMarkdown: ({ sectionId, value }) =>
      set((state) => {
        state.x[sectionId] = value;
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
  }))
);
