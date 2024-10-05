import {
  restrictToHorizontalAxis,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import _ from "lodash";
import { getSectionInfo, getSectionParentId } from "state/getters/sectionInfo";
import { getCollisionDetection } from "./collisionDetection";
import { useDndState } from "./dndState";

export function useModifiers() {
  const { isSorting, activeId } = useDndState(
    (x) => _.pick(x, ["isSorting", "activeId"]),
    _.isEqual,
  );

  const modifiers = getModifiers(isSorting, activeId);
  const collisionDetection = getCollisionDetection(isSorting);

  return { modifiers, collisionDetection };
}

function getModifiers(isSorting, activeId) {
  if (isSorting && activeId) {
    const parentId = getSectionParentId(activeId);
    if (parentId) {
      return getSectionInfo(parentId).isHorizontalOrientation
        ? [restrictToHorizontalAxis]
        : [restrictToVerticalAxis];
    }
  }
  return null;
}

// import {
//   restrictToHorizontalAxis,
//   restrictToVerticalAxis,
// } from "@dnd-kit/modifiers";
// import _ from "lodash";
// import { useEffect, useState } from "react";
// import { getSectionInfo, getSectionParentId } from "state/getters/sectionInfo";
// import { getCollisionDetection } from "./collisionDetection";
// import { useDndState } from "./dndState";

// export function useModifiers() {
//   const { isSorting, isMovingFree, activeId } = useDndState(
//     (x) => _.pick(x, ["isSorting", "activeId"]),
//     _.isEqual,
//   );

//   const [collisionDetection, setCollisionDetection] = useState(() => () => []);

//   const modifiers = getModifiers(isSorting, activeId);
//   useEffect(() => {
//     const x = getCollisionDetection(isSorting);
//     if (isSorting) {
//       setCollisionDetection(() => x);
//     } else if (isMovingFree) {
//       setTimeout(() => setCollisionDetection(() => x), 1000);
//     } else {
//       setCollisionDetection(() => () => []);
//     }
//   }, [isSorting, isMovingFree]);

//   console.log("collisionDetection", collisionDetection);

//   return { modifiers, collisionDetection };
// }

// function getModifiers(isSorting, activeId) {
//   if (isSorting && activeId) {
//     const parentId = getSectionParentId(activeId);
//     if (parentId) {
//       return getSectionInfo(parentId).isHorizontalOrientation
//         ? [restrictToHorizontalAxis]
//         : [restrictToVerticalAxis];
//     }
//   }
//   return null;
// }
