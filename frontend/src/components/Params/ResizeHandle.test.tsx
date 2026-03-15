import { renderToStaticMarkup } from "react-dom/server";
import { useSettings } from "state/definitions";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResizeHandle } from "./ResizeHandle";

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditLayout: true,
  }),
}));

describe("ResizeHandle", () => {
  beforeEach(() => {
    useSettings.setState(createSettingsState());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("anchors the resize hit area to the shared param column boundary", () => {
    const markup = renderToStaticMarkup(
      <ResizeHandle showResizeHandle={true} onMouseDown={vi.fn()} />,
    );

    expect(markup).toContain('data-param-resize-handle="true"');
    expect(markup).toContain("absolute");
    expect(markup).toContain("left:var(--param-column-width, 200px)");
  });
});
