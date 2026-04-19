import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canEditLayout: true,
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditLayout: mocks.canEditLayout,
  }),
}));

import { ResizeHandle } from "./ResizeHandle";

describe("ResizeHandle", () => {
  it("uses a single-node lightweight handle when requested", () => {
    const markup = renderToStaticMarkup(
      <ResizeHandle
        showResizeHandle={true}
        onMouseDown={() => undefined}
        lightweight={true}
      />,
    );

    expect(markup).toContain('data-param-resize-handle-lightweight="true"');
    expect(markup).toContain("opacity-0");
    expect(markup).toContain("group-hover/arg-group:opacity-100");
    expect(markup).toContain("hover:opacity-100");
    expect(markup.match(/<div/g)?.length).toBe(1);
  });

  it("keeps the legacy nested handle markup by default", () => {
    const markup = renderToStaticMarkup(
      <ResizeHandle showResizeHandle={true} onMouseDown={() => undefined} />,
    );

    expect(markup).not.toContain(
      'data-param-resize-handle-lightweight="true"',
    );
    expect(markup.match(/<div/g)?.length).toBe(3);
  });

  it("does not render when layout editing is unavailable", () => {
    mocks.canEditLayout = false;

    const markup = renderToStaticMarkup(
      <ResizeHandle
        showResizeHandle={true}
        onMouseDown={() => undefined}
        lightweight={true}
      />,
    );

    expect(markup).toBe("");
    mocks.canEditLayout = true;
  });
});
