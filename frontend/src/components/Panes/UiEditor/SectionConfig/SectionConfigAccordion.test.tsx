import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionConfigAccordion } from "./SectionConfigAccordion";

describe("SectionConfigAccordion", () => {
  it("renders predictable accordion trigger ids for e2e targeting", () => {
    // These testids are used by e2e tests to verify pane hierarchy behavior.
    const markup = renderToStaticMarkup(
      <SectionConfigAccordion
        openValues={["main"]}
        onOpenValuesChange={() => {}}
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
    expect(markup).toContain("section-config-accordion-chevron");
    expect(markup).toContain("<svg");
    expect(markup).toContain("h-5 w-5");
    expect(markup).toContain("box-border");
  });

  it("keeps only configured sections open when controlled", () => {
    // Controlled-open behavior drives the "primary visible, secondary collapsed"
    // hierarchy expected by the pane refinement plan.
    const markup = renderToStaticMarkup(
      <SectionConfigAccordion
        openValues={["main"]}
        onOpenValuesChange={() => {}}
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
      markup.match(
        /<button[^>]*data-testid="section-config-main-trigger"[^>]*>/,
      )?.[0] ?? "";
    const appearanceTriggerTag =
      markup.match(
        /<button[^>]*data-testid="section-config-appearance-trigger"[^>]*>/,
      )?.[0] ?? "";

    expect(mainTriggerTag).toContain('aria-expanded="true"');
    expect(appearanceTriggerTag).toContain('aria-expanded="false"');
  });

  it("disables empty sections and prevents open-state on disabled sections", () => {
    const markup = renderToStaticMarkup(
      <SectionConfigAccordion
        openValues={["appearance"]}
        onOpenValuesChange={() => {}}
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
            disabled: true,
            disabledReason: "No appearance settings available",
            content: <div>No appearance settings available</div>,
          },
        ]}
      />,
    );

    const appearanceTriggerTag =
      markup.match(
        /<button[^>]*data-testid="section-config-appearance-trigger"[^>]*>/,
      )?.[0] ?? "";

    expect(appearanceTriggerTag).toContain('disabled=""');
    expect(appearanceTriggerTag).toContain('aria-expanded="false"');
    expect(appearanceTriggerTag).toContain(
      'title="No appearance settings available"',
    );
  });

  it("supports controlled open values and drops disabled values", () => {
    const markup = renderToStaticMarkup(
      <SectionConfigAccordion
        openValues={["main", "appearance"]}
        onOpenValuesChange={() => {}}
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
            disabled: true,
            disabledReason: "No appearance settings available",
            content: <div>No appearance settings available</div>,
          },
        ]}
      />,
    );

    const mainTriggerTag =
      markup.match(
        /<button[^>]*data-testid="section-config-main-trigger"[^>]*>/,
      )?.[0] ?? "";
    const appearanceTriggerTag =
      markup.match(
        /<button[^>]*data-testid="section-config-appearance-trigger"[^>]*>/,
      )?.[0] ?? "";

    expect(mainTriggerTag).toContain('aria-expanded="true"');
    expect(appearanceTriggerTag).toContain('aria-expanded="false"');
  });
});
