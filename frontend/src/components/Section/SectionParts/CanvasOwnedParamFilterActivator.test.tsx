import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CanvasOwnedParamFilterActivator } from "./CanvasOwnedParamFilterActivator";

describe("CanvasOwnedParamFilterActivator", () => {
  it("renders the lightweight searchbox root markup at rest", () => {
    const markup = renderToStaticMarkup(
      <CanvasOwnedParamFilterActivator
        activatorClassName="filter-activator"
        id="section-1-args-filter"
        inputClassName="filter-input"
        onChange={() => undefined}
        placeholder="Filter"
        placeholderClassName="placeholder"
        value=""
      />,
    );

    expect(markup).toContain('data-canvas-owned-lightweight-filter-activator="true"');
    expect(markup).toContain('role="searchbox"');
    expect(markup).toContain('id="section-1-args-filter"');
    expect(markup).toContain(">Filter<");
    expect(markup).not.toContain("<input");
  });

  it("shows the active filter value in the lightweight root when one exists", () => {
    const markup = renderToStaticMarkup(
      <CanvasOwnedParamFilterActivator
        activatorClassName="filter-activator"
        id="section-1-args-filter"
        inputClassName="filter-input"
        onChange={() => undefined}
        placeholder="Filter"
        placeholderClassName="placeholder"
        value="aspect"
      />,
    );

    expect(markup).toContain(">aspect<");
    expect(markup).not.toContain(">Filter<");
  });
});
