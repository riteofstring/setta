import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SwitchInput } from "./SwitchInput";

describe("SwitchInput theme overrides", () => {
  it("uses default theme classes when overrides are not provided", () => {
    const markup = renderToStaticMarkup(
      <SwitchInput value={false} onChange={() => undefined} />,
    );

    expect(markup).toContain("bg-setta-400");
    expect(markup).toContain("data-[state=&#x27;checked&#x27;]:bg-blue-500");
    expect(markup).toContain("bg-white");
  });

  it("uses override theme classes and does not include defaults", () => {
    const markup = renderToStaticMarkup(
      <SwitchInput
        value={false}
        onChange={() => undefined}
        rootThemeClassName="bg-red-500"
        thumbThemeClassName="bg-green-500"
      />,
    );

    expect(markup).toContain("bg-red-500");
    expect(markup).not.toContain("bg-setta-400");
    expect(markup).toContain("bg-green-500");
    expect(markup).not.toContain("bg-white");
  });

  it("marks the switch root when the track is canvas-owned", () => {
    const markup = renderToStaticMarkup(
      <SwitchInput
        canvasOwnedTrack={true}
        value={false}
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain('data-canvas-owned-switch-track="true"');
    expect(markup).toContain('data-canvas-owned-switch-thumb="true"');
    expect(markup).not.toContain("bg-setta-400");
    expect(markup).not.toContain("bg-white");
    expect(markup).toContain("bg-transparent");
  });

  it("uses a lightweight non-button switch root when requested", () => {
    const markup = renderToStaticMarkup(
      <SwitchInput
        lightweightActivator={true}
        value={true}
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain('data-canvas-owned-lightweight-switch="true"');
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).not.toContain('type="button"');
  });

  it("can flatten the lightweight value shell onto the switch root", () => {
    const markup = renderToStaticMarkup(
      <SwitchInput
        canvasOwnedTrack={true}
        lightweightActivator={true}
        lightweightRootClassName="section-value justify-self-start self-center"
        value={false}
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain('data-canvas-owned-lightweight-switch="true"');
    expect(markup).toContain('data-canvas-owned-switch-thumb="true"');
    expect(markup).toContain("section-value");
    expect(markup.match(/<div/g)?.length ?? 0).toBe(1);
  });

  it("hides the non-flattened lightweight wrapper when the resting switch visual is canvas-owned", () => {
    const markup = renderToStaticMarkup(
      <SwitchInput
        canvasOwnedTrack={true}
        lightweightActivator={true}
        outerDivClassName="section-value flex justify-self-start self-center"
        value={false}
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain('data-canvas-owned-lightweight-switch="true"');
    expect(markup).toContain("section-value flex justify-self-start self-center opacity-0");
  });
});
