import { useSectionInfos } from "state/definitions";

export function dndAddChild({ oldParentId, newParentId, childId, index }) {
  useSectionInfos.setState((x) => {
    if (oldParentId) {
      x.dndChildren[oldParentId] = x.dndChildren[oldParentId].filter(
        (c) => c !== childId,
      );
    }

    x.dndChildren[newParentId] = [
      ...x.dndChildren[newParentId].slice(0, index),
      childId,
      ...x.dndChildren[newParentId].slice(index),
    ];

    x.dndParents[childId] = newParentId;
  });
}

// removeChild: (childId) =>
//   set((state) => {
//     const oldParentId = state.y[childId];
//     if (oldParentId) {
//       state.x[oldParentId] = state.x[oldParentId].filter(
//         (x) => x !== childId,
//       );
//       state.y[childId] = undefined;
//     }
//   }),
// replaceWithTemp: (id) =>
//   set((state) => {
//     const parentId = state.y[id];
//     if (parentId) {
//       const index = state.x[parentId].indexOf(id);
//       const tempId = getDndSectionId(id);
//       state.x[parentId][index] = tempId;
//       state.y[tempId] = parentId;
//       state.y[id] = undefined;
//     }
//   }),
// update: (sectionIdsToChildren) =>
//   set((state) => {
//     state.x = sectionIdsToChildren;
//     state.y = {};
//     for (const [id, children] of Object.entries(sectionIdsToChildren)) {
//       for (const c of children) {
//         state.y[c] = id;
//       }
//     }
//   }),
// updateOneParent: (sectionId, children) =>
//   set((state) => {
//     const oldChildren = state.x[sectionId];
//     state.x[sectionId] = children;
//     if (oldChildren) {
//       for (const c of oldChildren) {
//         state.y[c] = undefined;
//       }
//     }
//     for (const c of children) {
//       state.y[c] = sectionId;
//     }
//   }),
// updateKeys: (newKeys) =>
//   set((state) => {
//     for (const k of newKeys) {
//       if (!(k in state.x)) {
//         state.x[k] = [];
//       }
//     }
//   })
