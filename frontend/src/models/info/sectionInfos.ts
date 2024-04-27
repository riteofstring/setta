import _ from "lodash";
import { useUITypes } from "models/info/uiTypes";
import { SINGLETON_SECTIONS } from "utils/constants";
import { useDndChildren } from "utils/DNDSortable/dndChildren";
import { temporal } from "zundo";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import {
  GLOBAL_PARAM_SWEEP,
  GLOBAL_VARIABLES,
  isListRoot,
  VAR_CONTROL,
} from "z_utils/constants";
import {
  SectionInfoStateType,
  SectionInfoZustandType,
} from "z_utils/types/section";
import { createProjectState } from "../utils";
import { useKeywordRegex } from "./keywordRegex";

const initialState: SectionInfoStateType = {
  x: {},
  version: 0,
};

export const useSectionInfos = createProjectState(
  temporal(
    subscribeWithSelector(
      immer<SectionInfoZustandType>((set) => ({
        ...initialState,

        resetAndSetAll: ({ sections }) => {
          set(
            (state) => ({
              ...state,
              x: sections,
            }),
            true,
          );
        },

        setSectionInfo: (payload) => set((state) => ({ x: payload(state.x) })),

        setSectionInfoAttr: ({
          sectionId,
          sectionIds,
          attr,
          value,
          newValueFn,
        }) =>
          set((state) => {
            if (sectionIds) {
              sectionIds.forEach((id) => {
                valueOrNewValueFn({
                  obj: state.x[id],
                  attr,
                  value,
                  newValueFn,
                });
              });
            } else if (sectionId) {
              valueOrNewValueFn({
                obj: state.x[sectionId],
                attr,
                value,
                newValueFn,
              });
            }
          }),

        setSectionInfoAttrObjInput: ({ newValues }) =>
          set((state) => {
            for (const sectionId of Object.keys(newValues)) {
              state.x[sectionId] = Object.assign(
                state.x[sectionId],
                newValues[sectionId],
              );
            }
          }),

        setAllChildren: ({ sectionId, newStateFn }) =>
          set((state) => {
            state.x[sectionId].children = newStateFn(
              state.x[sectionId].children,
            );
          }),

        setChildrenNames: ({ sectionId, sectionType }) =>
          set((state) => {
            if (isListRoot(sectionType.type)) {
              const children = state.x[sectionId].children;
              for (let idx = 0; idx < children.length; idx++) {
                state.x[children[idx]].name = `[${idx}]`;
              }
            }
          }),

        removeSectionInfos: (payload) =>
          set((state) => {
            payload.forEach((y) => {
              delete state.x[y];
            });
            for (const [k, v] of Object.entries(state.x)) {
              state.x[k].children = v.children.filter(
                (x) => !payload.includes(x),
              );
              if (payload.includes(v.paramSweepSectionId)) {
                state.x[k].paramSweepSectionId = null;
              }
            }
          }),

        update: (payload) =>
          set((state) => {
            state.x = { ...state.x, ...payload };
          }),
        setResizeEvent: ({ sectionId, resizeEvent }) =>
          set((state) => {
            state.x[sectionId].resizeEvent = resizeEvent;
          }),
      })),
    ),
  ),
);

function valueOrNewValueFn({ obj, attr, value, newValueFn }) {
  if (newValueFn) {
    obj[attr] = newValueFn(obj[attr]);
  } else {
    obj[attr] = value;
  }
}

useSectionInfos.temporal.getState().pause();

function getSingletonSubscriptionFn(type) {
  return (state) => {
    for (const s of Object.values(state.x)) {
      if (useUITypes.getState().x[s.uiTypeId]?.type === type) {
        return s.id;
      }
    }
    return null;
  };
}

useSectionInfos.subscribe(getSingletonSubscriptionFn(GLOBAL_VARIABLES), (x) => {
  SINGLETON_SECTIONS.globalVariables = x;
  useKeywordRegex.getState().updateGlobalVariables(x);
});

useSectionInfos.subscribe(
  getSingletonSubscriptionFn(GLOBAL_PARAM_SWEEP),
  (x) => {
    SINGLETON_SECTIONS.globalParamSweep = x;
  },
);

useSectionInfos.subscribe(getSingletonSubscriptionFn(VAR_CONTROL), (x) => {
  SINGLETON_SECTIONS.varControl = x;
});

useSectionInfos.subscribe(
  (state) => _.mapValues(state.x, (v) => v.children),
  (x) => useDndChildren.getState().reset(x),
);

useSectionInfos.subscribe(
  (state) => _.mapValues(state.x, (v) => v.name),
  (x) => useKeywordRegex.getState().update(x),
  { equalityFn: _.isEqual },
);

export function manualDndChildrenReset() {
  useDndChildren
    .getState()
    .reset(_.mapValues(useSectionInfos.getState().x, (v) => v.children));
}
