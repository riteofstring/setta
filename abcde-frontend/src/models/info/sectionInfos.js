import { newSectionInfo } from "classes/mutableInfo";
import _ from "lodash";
import { isListRoot } from "utils/constants";
import { immer } from "zustand/middleware/immer";
import { create } from "../utils";

function setDefaultAllChildren(state, sectionId) {
  if (!(sectionId in state.allChildren)) {
    state.allChildren[sectionId] = [];
  }
  return state.allChildren[sectionId];
}

const initialState = { x: {}, allChildren: {}, currChildren: {} };

export const useSectionInfos = create(
  immer((set, get) => ({
    ...initialState,

    resetAndSetAll: ({ sections, sectionConfigCol, sectionChildren }) => {
      const sectionInfos = _.mapValues(sections, (x) => {
        const parentId = _.filter(sectionChildren, (v) => v.includes(x.id))[0];
        const y = newSectionInfo({
          ...x,
          parentId,
          configId: sectionConfigCol[x.id],
        });
        return y;
      });
      const s = get();
      s.reset();
      s.setAll({ x: sectionInfos, allChildren: sectionChildren });
    },

    setSectionInfo: (payload) => set((state) => ({ x: payload(state.x) })),

    setSectionInfoAttr: ({ sectionId, sectionIds, attr, value }) =>
      set((state) => {
        if (sectionIds) {
          sectionIds.forEach((id) => (state.x[id][attr] = value));
        } else {
          state.x[sectionId][attr] = value;
        }
      }),

    setSectionInfoAttrObjInput: ({ newValues }) =>
      set((state) => {
        for (let sectionId of Object.keys(newValues)) {
          state.x[sectionId] = Object.assign(
            state.x[sectionId],
            newValues[sectionId]
          );
        }
      }),

    setAllChildren: ({ sectionId, newStateFn }) =>
      set((state) => {
        const currState = setDefaultAllChildren(state, sectionId);
        state.allChildren[sectionId] = newStateFn(currState);
      }),

    setCurrChildrenNames: ({ currChildren, sectionType }) =>
      set((state) => {
        if (isListRoot(sectionType.type)) {
          for (let idx = 0; idx < currChildren.length; idx++) {
            state.x[currChildren[idx]].name = `[${idx}]`;
          }
        }
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
