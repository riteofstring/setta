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

  test("renders expanded and collapsed disclosure state", () => {
    const closed = renderAccordion(false);
    const open = renderAccordion(true);

    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain('aria-hidden="true"');
    expect(closed).toContain('data-state="closed"');
    expect(closed).not.toContain('role="separator"');
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('aria-hidden="false"');
    expect(open).toContain('data-state="open"');
    expect(open).toContain('role="separator"');
    expect(open).toContain('aria-label="Resize Test"');
  });

  test("renders header actions in the section header", () => {
    const html = renderAccordion(true, createElement("button", { type: "button" }, "New"));

    expect(html).toContain(">Test</span>");
    expect(html).toContain(">New</button>");
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
