import { describe, expect, it } from "vitest";

import { DrawingSceneAuthority } from "./drawingSceneAuthority";

const first = { objects: [{ id: "first" }] };
const second = { objects: [{ id: "first" }, { id: "second" }] };
const third = {
  objects: [{ id: "first" }, { id: "second" }, { id: "third" }],
};

describe("drawing scene authority", () => {
  it("keeps delayed canonical scenes from replacing unacknowledged local work", () => {
    const authority = new DrawingSceneAuthority(first);

    expect(authority.shouldLoad(first)).toBe(false);
    authority.localChange();
    const pending = authority.prepareCommit(second);

    expect(authority.shouldLoad(first)).toBe(false);
    expect(authority.acknowledge(pending, second)).toBe(true);
    expect(authority.shouldLoad(second)).toBe(false);
    expect(authority.shouldLoad(third)).toBe(true);
  });

  it("does not let an older acknowledgement clear newer local work", () => {
    const authority = new DrawingSceneAuthority(first);

    authority.localChange();
    const pending = authority.prepareCommit(second);
    authority.localChange();

    expect(authority.acknowledge(pending, second)).toBe(false);
    expect(authority.shouldLoad(first)).toBe(false);
  });

  it("records an externally loaded scene only while local state is clean", () => {
    const authority = new DrawingSceneAuthority(first);

    expect(authority.shouldLoad(second)).toBe(true);
    authority.loaded(second);
    expect(authority.shouldLoad(second)).toBe(false);
    authority.localChange();
    authority.loaded(third);
    expect(authority.shouldLoad(first)).toBe(false);
  });
});
