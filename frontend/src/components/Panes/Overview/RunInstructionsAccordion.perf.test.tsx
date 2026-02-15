import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunInstructionsAccordion } from "./RunInstructionsAccordion";

describe("RunInstructionsAccordion (perf)", () => {
  it("renders large accordion payloads fast enough for pane interactions", () => {
    const items = Array.from({ length: 300 }, (_, index) => ({
      value: `item-${index}`,
      title: `Section ${index}`,
      triggerTestId: `run-instructions-accordion-item-${index}`,
      content: <div>Payload {index}</div>,
      disabled: index % 7 === 0,
      disabledReason: index % 7 === 0 ? "Disabled for perf test" : undefined,
    }));
    const controlledOpenValues = items
      .filter((item, index) => index % 6 === 0)
      .map((item) => item.value);

    const start = performance.now();
    let markup = "";
    for (let i = 0; i < 12; i += 1) {
      markup = renderToStaticMarkup(
        <RunInstructionsAccordion
          openValues={controlledOpenValues}
          onOpenValuesChange={() => {}}
          items={items}
        />,
      );
    }
    const elapsedMs = performance.now() - start;

    expect(markup.length).toBeGreaterThan(10_000);

    // Generous guard to catch algorithmic regressions while avoiding flake.
    expect(elapsedMs).toBeLessThan(3_000);
  });
});
