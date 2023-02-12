import { isListRoot } from "abcde-utils/src/constants";
import { newSectionInfo } from "abcde-utils/src/objs/sectionInfo";
import {
  SectionInfoStateType,
  SectionInfoZustandType,
} from "abcde-utils/src/types/section";
import _ from "lodash";
import { immer } from "zustand/middleware/immer";
import { create } from "../utils";
import { initValue } from "./utils";

const initialState: SectionInfoStateType = {
  x: {},
  allChildren: {},
  currChildren: {},
};

export const useSectionInfos = create(
  immer<SectionInfoZustandType>((set, get) => ({
    ...initialState,

    resetAndSetAll: ({ sections, sectionConfigCol, sectionChildren }) => {
      const sectionInfos = _.mapValues(sections, (x, id) => {
        let parentId: string | null = null;
        for (const [k, v] of Object.entries(sectionChildren)) {
          if (v.includes(id)) {
            parentId = k;
            break;
          }
        }
        const y = newSectionInfo({
          ...x,
          parentId,
          configId: sectionConfigCol[id],
        });
        return y;
      });
      const s = get();
      s.reset();
      s.setAll({
        x: sectionInfos,
        allChildren: sectionChildren,
        currChildren: {},
      });
    },

    setSectionInfo: (payload) => set((state) => ({ x: payload(state.x) })),

    setSectionInfoAttr: ({ sectionId, sectionIds, attr, value, newValueFn }) =>
      set((state) => {
        if (sectionIds) {
          sectionIds.forEach((id) => {
            valueOrNewValueFn({ obj: state.x[id], attr, value, newValueFn });
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
        state.allChildren[sectionId] = newStateFn(state.allChildren[sectionId]);
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
      }),

    setAll: (payload) => set(payload),

    reset: () => set(initialState),
  }))
);

function valueOrNewValueFn({ obj, attr, value, newValueFn }) {
  if (value) {
    obj[attr] = value;
  } else if (newValueFn) {
    obj[attr] = newValueFn(obj[attr]);
  }
}
