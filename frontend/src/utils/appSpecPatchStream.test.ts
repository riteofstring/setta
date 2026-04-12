import { describe, expect, it } from "vitest";

import {
  applyPatchOp,
  createEmptySpec,
  parsePatchLine,
} from "./appSpecPatchStream";

describe("appSpecPatchStream", () => {
  it("uses the Go-owned patch policy when parsing lines", () => {
    expect(parsePatchLine("// keepalive")).toBeNull();
    expect(parsePatchLine('{"op":"remove","path":"/root"}')).toEqual({
      op: "remove",
      path: "/root",
    });
    expect(parsePatchLine('{"op":"set","path":"/root"}')).toBeNull();
    expect(
      parsePatchLine('{"op":"set","path":"/not-allowed","value":1}'),
    ).toBeNull();
  });

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

  it("resets the root key when a root remove patch is applied", () => {
    const spec = createEmptySpec();
    spec.root = "foo";

    applyPatchOp(spec, {
      op: "remove",
      path: "/root",
    });

    expect(spec.root).toBe("");
  });
});
