import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addParamChild,
  getParamDndParentByChild,
  getParamDndParentId,
  replaceParamsWithTemp,
  resetParamDndChildren,
  updateParamChildren,
  useParamDndChildren,
} from "./paramDndChildren";
import {
  getParamDndItemId,
  getTempParamDndId,
  type ParamListKey,
} from "./paramDndState";

describe("paramDndChildren state", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  it("builds forward and reverse param child maps", () => {
    // Validates map hydration for parameter parent/child relationships.
    updateParamChildren({
      parentA: ["child1", "child2"],
      parentB: ["child3"],
    });

    const state = useParamDndChildren.getState();
    expect(state.x).toEqual({
      parentA: ["child1", "child2"],
      parentB: ["child3"],
    });
    expect(state.y).toEqual({
      child1: "parentA",
      child2: "parentA",
      child3: "parentB",
    });
  });

  it("moves params between parents and updates reverse lookup", () => {
    // Validates add operation reorders destination list and updates parent mapping.
    updateParamChildren({
      parentA: ["child1", "child2"],
      parentB: ["child3"],
    });

    addParamChild("parentA", "parentB", "child1", 0);

    const state = useParamDndChildren.getState();
    expect(state.x.parentA).toEqual(["child2"]);
    expect(state.x.parentB).toEqual(["child1", "child3"]);
    expect(getParamDndParentId("child1")).toBe("parentB");
  });

  it("replaces dragged params with a temporary placeholder", () => {
    // Validates placeholder insertion position and stale temp cleanup.
    const staleTempId = getTempParamDndId(getParamDndItemId("stale", "pinned"));
    updateParamChildren({
      parentA: ["param-a", "param-b", "param-c"],
      parentB: [staleTempId],
    });

    replaceParamsWithTemp("active", "pinned", ["param-b", "param-c"]);

    const tempId = getTempParamDndId(getParamDndItemId("active", "pinned"));
    const state = useParamDndChildren.getState();
    expect(state.x.parentA).toEqual(["param-a", tempId]);
    expect(state.x.parentB).toEqual([]);
    expect(state.y[tempId]).toBe("parentA");
    expect(state.y["param-b"]).toBeUndefined();
    expect(state.y["param-c"]).toBeUndefined();
    expect(state.y[staleTempId]).toBeUndefined();
  });

  it("maps parentByChild to list-key-specific dnd ids", () => {
    // Validates list-key remapping for param collisions and sortable lookups.
    const listKey: ParamListKey = "pinned";
    const tempChildId = getTempParamDndId(getParamDndItemId("child2", listKey));
    updateParamChildren({
      parentA: ["child1", tempChildId],
    });

    expect(getParamDndParentByChild(null)).toEqual({
      child1: "parentA",
      [tempChildId]: "parentA",
    });

    expect(getParamDndParentByChild(listKey)).toEqual({
      [getParamDndItemId("child1", listKey)]: getParamDndItemId(
        "parentA",
        listKey,
      ),
      [tempChildId]: getParamDndItemId("parentA", listKey),
    });
  });

  it("supports explicit reset", () => {
    // Validates manual reset path clears both lookup maps.
    updateParamChildren({
      parentA: ["child1"],
    });

    resetParamDndChildren();

    const state = useParamDndChildren.getState();
    expect(state.x).toEqual({});
    expect(state.y).toEqual({});
  });
});
