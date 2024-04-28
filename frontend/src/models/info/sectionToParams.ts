import _ from "lodash";
import { SINGLETON_SECTIONS } from "utils/constants";
import { temporal } from "zundo";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";
import { useKeywordRegex } from "./keywordRegex";
import { useSectionInfos } from "./sectionInfos";

// This is a special state that maps directly from
// sectionIds to current callables and params

const initialState = { callables: {}, params: {} };

export const useSectionToParams = createProjectState(
  temporal(
    subscribeWithSelector(
      immer((set) => ({
        ...initialState,
        setCallables: ({ sectionId, callables }) =>
          set((state) => {
            state.callables[sectionId] = callables;
          }),
        setParams: ({ sectionId, params }) =>
          set((state) => {
            state.params[sectionId] = params;
          }),
      })),
    ),
  ),
);

useSectionToParams.temporal.getState().pause();

useSectionToParams.subscribe(
  (state) => state.params[SINGLETON_SECTIONS.globalVariables],
  () =>
    useKeywordRegex
      .getState()
      .update(_.mapValues(useSectionInfos.getState().x, (v) => v.name)),
  { equalityFn: _.isEqual },
);
