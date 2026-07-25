import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import PrototypeGalleryPage from "./prototype-gallery-page";

describe("prototype gallery page", () => {
  test("renders semantic category, selection, preview, and control regions", () => {
    const html = renderToString(<PrototypeGalleryPage onBack={vi.fn()} platform="darwin" />);

    expect(html).toContain('data-testid="prototype-gallery-page"');
    expect(html).toContain('aria-label="Prototype categories"');
    expect(html).toContain("Niri atmospheres");
    expect(html).toContain("Agent forms");
    expect(html).toContain("Thinking backdrops");
    expect(html).toContain("Veil Drift");
    expect(html).toContain('aria-label="Selected prototype"');
    expect(html).toContain("Quality");
    expect(html).toContain("Live metrics");
  });

  test("mounts exactly one live renderer for the initial selection", () => {
    const html = renderToString(<PrototypeGalleryPage onBack={vi.fn()} platform="linux" />);

    expect(html.match(/class="prototype-niri-background /g)).toHaveLength(1);
    expect(html).not.toContain("prototype-agent-form__canvas");
    expect(html).not.toContain("prototype-thinking-backdrop");
    expect(html).toContain('aria-hidden="true" class="prototype-niri-background__wash"');
  });
});
