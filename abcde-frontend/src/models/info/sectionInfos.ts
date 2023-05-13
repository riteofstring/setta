import { isListRoot } from "abcde-utils/src/constants";
import {
  SectionInfoStateType,
  SectionInfoZustandType,
} from "abcde-utils/src/types/section";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";
import { initValue } from "./utils";

const initialState: SectionInfoStateType = {
  x: {},
  allChildren: {},
  currChildren: {},
  version: 0,
};

export const useSectionInfos = createProjectState(
  temporal(
    immer<SectionInfoZustandType>((set) => ({
      ...initialState,

      resetAndSetAll: ({ sections, sectionChildren }) => {
        // const sectionInfos = _.mapValues(sections, (x, id) => {
        //   let parentId: string | null = null;
        //   for (const [k, v] of Object.entries(sectionChildren)) {
        //     if (v.includes(id)) {
        //       parentId = k;
        //       break;
        //     }
        //   }
        //   const y = newSectionInfo({
        //     ...x,
        //     parentId,
        //     configId: sectionConfigCol[id],
        //   });
        //   return y;
        // });
        set(
          (state) => ({
            ...state,
            x: sections,
            allChildren: sectionChildren,
            currChildren: {},
          }),
          true
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
              newValues[sectionId]
            );
          }
        }),

      setAllChildren: ({ sectionId, newStateFn }) =>
        set((state) => {
          state.allChildren[sectionId] = newStateFn(
            state.allChildren[sectionId]
          );
        }),

      initManyAllChildren: ({ sectionIds }) =>
        set((state) => {
          sectionIds.forEach((id) => {
            initValue(state.allChildren, id, []);
          });
        }),

      setCurrChildrenNames: ({ currChildren, sectionType }) =>
        set((state) => {
          if (isListRoot(sectionType.type)) {
            for (let idx = 0; idx < currChildren.length; idx++) {
              state.x[currChildren[idx]].name = `[${idx}]`;
            }
          }
        }),

      initManyCurrChildren: ({ sectionIds }) =>
        set((state) => {
          sectionIds.forEach((id) => {
            initValue(state.currChildren, id, []);
          });
        }),

      setCurrChildren: ({ sectionId, currChildren }) =>
        set((state) => {
          state.currChildren[sectionId] = currChildren;
        }),

      removeSectionInfos: (payload) =>
        set((state) => {
          payload.forEach((y) => {
            delete state.x[y];
            delete state.allChildren[y];
            delete state.currChildren[y];
          });
          for (const [k, v] of Object.entries(state.allChildren)) {
            state.allChildren[k] = v.filter((x) => !payload.includes(x));
          }
        }),
    }))
  )
);

function valueOrNewValueFn({ obj, attr, value, newValueFn }) {
  if (newValueFn) {
    obj[attr] = newValueFn(obj[attr]);
  } else {
    obj[attr] = value;
  }
}

useSectionInfos.temporal.getState().pause();
