import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionConfigAccordion } from "./SectionConfigAccordion";

describe("SectionConfigAccordion", () => {
  it("renders predictable accordion trigger ids for e2e targeting", () => {
    // These testids are used by e2e tests to verify pane hierarchy behavior.
    const markup = renderToStaticMarkup(
      <SectionConfigAccordion
        defaultOpenValues={["main"]}
        items={[
          {
            value: "main",
            title: "Main",
            triggerTestId: "section-config-main-trigger",
            content: <div>Main content</div>,
          },
          {
            value: "appearance",
            title: "Appearance",
            triggerTestId: "section-config-appearance-trigger",
            content: <div>Appearance content</div>,
          },
        ]}
      />,
    );

    expect(markup).toContain('data-testid="section-config-main-trigger"');
    expect(markup).toContain('data-testid="section-config-appearance-trigger"');
  });

  it("keeps only configured sections open by default", () => {
    // Default-open behavior drives the "primary visible, secondary collapsed"
    // hierarchy expected by the pane refinement plan.
    const markup = renderToStaticMarkup(
      <SectionConfigAccordion
        defaultOpenValues={["main"]}
        items={[
          {
            value: "main",
            title: "Main",
            triggerTestId: "section-config-main-trigger",
            content: <div>Main content</div>,
          },
          {
            value: "appearance",
            title: "Appearance",
            triggerTestId: "section-config-appearance-trigger",
            content: <div>Appearance content</div>,
          },
        ]}
      />,
    );

    const mainTriggerTag =
      markup.match(/<button[^>]*data-testid="section-config-main-trigger"[^>]*>/)?.[0] ??
      "";
    const appearanceTriggerTag =
      markup.match(
        /<button[^>]*data-testid="section-config-appearance-trigger"[^>]*>/,
      )?.[0] ?? "";

    expect(mainTriggerTag).toContain('aria-expanded="true"');
    expect(appearanceTriggerTag).toContain('aria-expanded="false"');
  });

});
