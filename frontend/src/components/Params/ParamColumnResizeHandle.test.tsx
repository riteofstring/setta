import { renderToStaticMarkup } from "react-dom/server";
import { useSettings } from "state/definitions";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParamColumnResizeHandle } from "./ParamColumnResizeHandle";

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditLayout: true,
  }),
}));

describe("ParamColumnResizeHandle", () => {
  beforeEach(() => {
    useSettings.setState(createSettingsState());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("anchors the shared Tier 1 resize overlay to the shared param column boundary", () => {
    const markup = renderToStaticMarkup(
      <ParamColumnResizeHandle onMouseDown={vi.fn()} />,
    );

    expect(markup).toContain('data-param-column-resize-overlay="true"');
    expect(markup).toContain("absolute");
    expect(markup).toContain(
      "left:calc(var(--param-column-width, 200px) + 0.72rem + 2px)",
    );
  });
});
