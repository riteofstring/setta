import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaneAccordion } from "./PaneAccordion";

const enabledTriggerClassName = "pane-accordion-enabled";
const disabledTriggerClassName = "pane-accordion-disabled";

describe("PaneAccordion", () => {
  it("renders optional trigger descriptions and custom class hooks", () => {
    const markup = renderToStaticMarkup(
      <PaneAccordion
        items={[
          {
            value: "alpha",
            title: "Alpha",
            description: "Alpha description",
            triggerTestId: "pane-accordion-alpha-trigger",
            content: <div>Alpha content</div>,
          },
        ]}
        defaultOpenValues={["alpha"]}
        enabledTriggerClassName={enabledTriggerClassName}
        disabledTriggerClassName={disabledTriggerClassName}
        chevronClassName="pane-accordion-chevron"
        rootClassName="pane-accordion-root"
        itemClassName="pane-accordion-item"
        contentClassName="pane-accordion-content"
        titleWrapperClassName="pane-accordion-title-wrapper"
        titleClassName="pane-accordion-title"
        descriptionClassName="pane-accordion-description"
      />,
    );

    expect(markup).toContain("pane-accordion-root");
    expect(markup).toContain("pane-accordion-item");
    expect(markup).toContain("pane-accordion-content");
    expect(markup).toContain("pane-accordion-title-wrapper");
    expect(markup).toContain("pane-accordion-title");
    expect(markup).toContain("pane-accordion-description");
    expect(markup).toContain("Alpha description");
  });

  it("filters disabled values from controlled open state", () => {
    const markup = renderToStaticMarkup(
      <PaneAccordion
        items={[
          {
            value: "enabled-item",
            title: "Enabled",
            triggerTestId: "pane-accordion-enabled-item",
            content: <div>Enabled content</div>,
          },
          {
            value: "disabled-item",
            title: "Disabled",
            triggerTestId: "pane-accordion-disabled-item",
            disabled: true,
            disabledReason: "Disabled for test",
            content: <div>Disabled content</div>,
          },
        ]}
        openValues={["enabled-item", "disabled-item"]}
        onOpenValuesChange={() => {}}
        enabledTriggerClassName={enabledTriggerClassName}
        disabledTriggerClassName={disabledTriggerClassName}
        chevronClassName="pane-accordion-chevron"
      />,
    );

    const enabledTriggerTag =
      markup.match(
        /<button[^>]*data-testid="pane-accordion-enabled-item"[^>]*>/,
      )?.[0] ?? "";
    const disabledTriggerTag =
      markup.match(
        /<button[^>]*data-testid="pane-accordion-disabled-item"[^>]*>/,
      )?.[0] ?? "";

    expect(enabledTriggerTag).toContain('aria-expanded="true"');
    expect(disabledTriggerTag).toContain('aria-expanded="false"');
    expect(disabledTriggerTag).toContain('disabled=""');
  });
});
