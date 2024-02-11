import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { isListRoot } from "z_utils/constants";
import {
  SectionInfoStateType,
  SectionInfoZustandType,
} from "z_utils/types/section";
import { createProjectState } from "../utils";

const initialState: SectionInfoStateType = {
  x: {},
  version: 0,
};

export const useSectionInfos = createProjectState(
  temporal(
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
          state.x[sectionId].children = newStateFn(state.x[sectionId].children);
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
);

function valueOrNewValueFn({ obj, attr, value, newValueFn }) {
  if (newValueFn) {
    obj[attr] = newValueFn(obj[attr]);
  } else {
    obj[attr] = value;
  }
}

useSectionInfos.temporal.getState().pause();
