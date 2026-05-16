import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveFullIndexForVisibleInsertion } from "./paramTree";

const PARAM_TREE_PROPERTY_RUNS = 100;

describe("param tree helpers", () => {
  it("maps visible insertions to full indexes without reordering hidden siblings", () => {
    fc.assert(
      fc.property(
        fc.record({
          fullCount: fc.integer({ max: 12, min: 1 }),
          movingIndexes: fc.uniqueArray(fc.integer({ max: 11, min: 0 }), {
            maxLength: 4,
          }),
          targetVisibleIndex: fc.integer({ max: 12, min: 0 }),
          visibleIndexes: fc.uniqueArray(fc.integer({ max: 11, min: 0 }), {
            maxLength: 12,
          }),
        }),
        ({ fullCount, movingIndexes, targetVisibleIndex, visibleIndexes }) => {
          const fullChildren = Array.from(
            { length: fullCount },
            (_, index) => `param-${index}`,
          );
          const validIndex = (index: number) => index < fullChildren.length;
          const movingIds = new Set(
            movingIndexes.filter(validIndex).map((index) => fullChildren[index]),
          );
          const visibleSiblings = visibleIndexes
            .filter(validIndex)
            .sort((left, right) => left - right)
            .map((index) => fullChildren[index])
            .filter((id): id is string => Boolean(id));
          const boundedTargetVisibleIndex = Math.min(
            targetVisibleIndex,
            visibleSiblings.filter((id) => !movingIds.has(id)).length,
          );
          const fullIndex = resolveFullIndexForVisibleInsertion({
            fullChildren,
            movingIds,
            targetVisibleIndex: boundedTargetVisibleIndex,
            visibleSiblings,
          });

          expect(fullIndex).not.toBeNull();
          const moved = applyMove({
            fullChildren,
            movingIds,
            newIndex: fullIndex!,
          });
          const hiddenBefore = getHiddenChildren({
            fullChildren,
            movingIds,
            visibleSiblings,
          });
          const hiddenAfter = getHiddenChildren({
            fullChildren: moved,
            movingIds,
            visibleSiblings: visibleSiblings.filter((id) => !movingIds.has(id)),
          });

          expect(hiddenAfter).toEqual(hiddenBefore);
        },
      ),
      { numRuns: PARAM_TREE_PROPERTY_RUNS },
    );
  });

  it("rejects visible insertions outside the remaining visible range", () => {
    expect(
      resolveFullIndexForVisibleInsertion({
        fullChildren: ["a", "b", "c"],
        movingIds: new Set(["b"]),
        targetVisibleIndex: 3,
        visibleSiblings: ["a", "b", "c"],
      }),
    ).toBeNull();
  });
});

function applyMove({
  fullChildren,
  movingIds,
  newIndex,
}: {
  readonly fullChildren: readonly string[];
  readonly movingIds: ReadonlySet<string>;
  readonly newIndex: number;
}): readonly string[] {
  const moving = fullChildren.filter((id) => movingIds.has(id));
  const remaining = fullChildren.filter((id) => !movingIds.has(id));
  return [
    ...remaining.slice(0, newIndex),
    ...moving,
    ...remaining.slice(newIndex),
  ];
}

function getHiddenChildren({
  fullChildren,
  movingIds,
  visibleSiblings,
}: {
  readonly fullChildren: readonly string[];
  readonly movingIds: ReadonlySet<string>;
  readonly visibleSiblings: readonly string[];
}): readonly string[] {
  const visibleSet = new Set(visibleSiblings);
  return fullChildren.filter((id) => !visibleSet.has(id) && !movingIds.has(id));
}
