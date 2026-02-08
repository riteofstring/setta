import { describe, expect, it } from "vitest";

import { applyPatchOp, createEmptySpec } from "./appSpecPatchStream";

describe("appSpecPatchStream", () => {
  it("does not create an element when patching nested fields", () => {
    const spec = createEmptySpec();

    applyPatchOp(spec, {
      op: "set",
      path: "/elements/foo/props/title",
      value: "Hello",
    });

    expect(spec.elements.foo).toBeUndefined();

    applyPatchOp(spec, {
      op: "set",
      path: "/elements/foo",
      value: { key: "foo", type: "Card" },
    });

    applyPatchOp(spec, {
      op: "set",
      path: "/elements/foo/props/title",
      value: "Hello",
    });

    expect(spec.elements.foo?.props?.title).toBe("Hello");
  });
});

