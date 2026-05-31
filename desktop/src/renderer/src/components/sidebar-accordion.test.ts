import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { constrainSectionHeight, SidebarAccordionSection } from "./sidebar-accordion";

describe("sidebar accordion sizing", () => {
  test("caps resized sections to the rendered content height", () => {
    expect(constrainSectionHeight(300, 120)).toBe(120);
    expect(constrainSectionHeight(900, 800)).toBe(520);
  });

  test("does not force minimum whitespace when content is shorter than the minimum", () => {
    expect(constrainSectionHeight(80, 24)).toBe(24);
  });

  test("keeps a usable minimum when content can scroll", () => {
    expect(constrainSectionHeight(10, 120)).toBe(40);
  });

  test("renders fast motion classes for expanded and collapsed sections", () => {
    const closed = renderAccordion(false);
    const open = renderAccordion(true);

    expect(closed).toContain("duration-125");
    expect(closed).toContain("grid-rows-[0fr]");
    expect(closed).toContain('aria-hidden="true"');
    expect(open).toContain("grid-rows-[1fr]");
    expect(open).toContain("ease-[cubic-bezier(0.16,1,0.3,1)]");
  });

  test("keeps header actions hidden until section hover or focus", () => {
    const html = renderAccordion(true, createElement("button", { type: "button" }, "New"));

    expect(html).toContain("opacity-0");
    expect(html).toContain("duration-75");
    expect(html).toContain("group-hover/section:opacity-100");
    expect(html).toContain("group-focus-within/section:opacity-100");
  });
});

function renderAccordion(open: boolean, action?: ReturnType<typeof createElement>) {
  const child = createElement("button", { type: "button" }, "Item");
  return renderToString(
    createElement(SidebarAccordionSection, {
      action,
      children: child,
      height: 80,
      onHeightChange: () => {},
      onOpenChange: () => {},
      open,
      resized: false,
      testId: "test-section",
      title: "Test",
    }),
  );
}
