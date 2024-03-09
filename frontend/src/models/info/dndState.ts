import { createProjectState } from "../utils";

const initialState = {
  activeId: null,
  activeIsTopLevel: false,
  overId: null,
  shouldDrop: false,
  centerYCondition: false,
  leftDistCondition: false,
  dndMode: false,
  xDelta: 0,
};

export const useDndState = createProjectState((set) => ({
  ...initialState,
  setActive: ({ id, isTopLevel }) =>
    set({ activeId: id, activeIsTopLevel: isTopLevel }),
  setOver: (props) => set(props),
  activateDnd: () => set({ dndMode: true }),
  deactivateDnd: () => set({ dndMode: false }),
  reset: () =>
    set((state) => ({
      ...initialState,
      centerYCondition: state.centerYCondition,
      leftDistCondition: state.leftDistCondition,
    })),
}));

// import { create } from "./utils";

// const initialState = {
//   isSorting: false,
//   isMovingFree: false,
// };

// function attachEventListeners(state) {
//   const conditions = {
//     isSorting: (e) => e.key === "Control",
//     isMovingFree: (e) => e.key === "Alt",
//   };

//   for (const [attrName, cond] of Object.entries(conditions)) {
//     document.addEventListener("keydown", (e) =>
//       state.getState().setActivation(attrName, cond(e)),
//     );
//     document.addEventListener("keyup", () =>
//       state.getState().setActivation(attrName, false),
//     );
//   }

//   document.addEventListener("blur", () => state.getState().reset());

//   //has to be window, not document
//   window.addEventListener("focus", () => {
//     state.getState().reset();
//   });

//   return state;
// }

// export const useKeyActivations = create((set) => ({
//   ...initialState,
//   setActivation: (key, value) => set({ [key]: value }),
//   reset: () => set(initialState),
// }));

// attachEventListeners(useKeyActivations);
