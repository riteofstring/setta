import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunInstructionsAccordion } from "./RunInstructionsAccordion";

describe("RunInstructionsAccordion", () => {
  it("renders predictable accordion trigger ids for e2e targeting", () => {
    const markup = renderToStaticMarkup(
      <RunInstructionsAccordion
        defaultOpenValues={["custom-runs"]}
        items={[
          {
            value: "codegen",
            title: "Codegen Policy",
            triggerTestId: "run-instructions-accordion-codegen-policy",
            content: <div>Codegen content</div>,
          },
          {
            value: "custom-runs",
            title: "Run Button Dropdown Items",
            triggerTestId: "run-instructions-accordion-custom-runs",
            content: <div>Run items</div>,
          },
        ]}
      />,
    );

    expect(markup).toContain(
      'data-testid="run-instructions-accordion-codegen-policy"',
    );
    expect(markup).toContain(
      'data-testid="run-instructions-accordion-codegen-policy-item"',
    );
    expect(markup).toContain(
      'data-testid="run-instructions-accordion-custom-runs-content"',
    );
    expect(markup).toContain(
      'data-testid="run-instructions-accordion-custom-runs"',
    );
    expect(markup).toContain("run-instructions-accordion-chevron");
    expect(markup).toContain("<svg");
    expect(markup).toContain("h-5 w-5");
    expect(markup).toContain("box-border");
  });

  it("disables empty sections and excludes them from default-open values", () => {
    const markup = renderToStaticMarkup(
      <RunInstructionsAccordion
        defaultOpenValues={["add-from-code-blocks"]}
        items={[
          {
            value: "custom-runs",
            title: "Run Button Dropdown Items",
            triggerTestId: "run-instructions-accordion-custom-runs",
            content: <div>Run items</div>,
          },
          {
            value: "add-from-code-blocks",
            title: "Add From Code Blocks",
            triggerTestId: "run-instructions-accordion-add-from-code-blocks",
            disabled: true,
            disabledReason: "No runnable code blocks are available",
            content: <div>No runnable code blocks are available</div>,
          },
        ]}
      />,
    );

    const addFromCodeBlocksTag =
      markup.match(
        /<button[^>]*data-testid="run-instructions-accordion-add-from-code-blocks"[^>]*>/,
      )?.[0] ?? "";

    expect(addFromCodeBlocksTag).toContain('disabled=""');
    expect(addFromCodeBlocksTag).toContain('aria-expanded="false"');
    expect(addFromCodeBlocksTag).toContain(
      'title="No runnable code blocks are available"',
    );
  });

  it("supports controlled open values for persisted accordion state", () => {
    const markup = renderToStaticMarkup(
      <RunInstructionsAccordion
        defaultOpenValues={["custom-runs"]}
        openValues={["codegen"]}
        items={[
          {
            value: "codegen",
            title: "Codegen Policy",
            triggerTestId: "run-instructions-accordion-codegen-policy",
            content: <div>Codegen content</div>,
          },
          {
            value: "custom-runs",
            title: "Run Button Dropdown Items",
            triggerTestId: "run-instructions-accordion-custom-runs",
            content: <div>Run items</div>,
          },
        ]}
      />,
    );

    const codegenTriggerTag =
      markup.match(
        /<button[^>]*data-testid="run-instructions-accordion-codegen-policy"[^>]*>/,
      )?.[0] ?? "";
    const customRunsTriggerTag =
      markup.match(
        /<button[^>]*data-testid="run-instructions-accordion-custom-runs"[^>]*>/,
      )?.[0] ?? "";

    expect(codegenTriggerTag).toContain('aria-expanded="true"');
    expect(customRunsTriggerTag).toContain('aria-expanded="false"');
  });
});
