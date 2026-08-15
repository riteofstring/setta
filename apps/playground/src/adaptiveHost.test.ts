import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const playgroundStyles = readFileSync(new URL("./index.css", import.meta.url), "utf8");
const playgroundHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const packedConsumerStyles = readFileSync(
  new URL("../../../fixtures/packed-consumer/src/consumer.css", import.meta.url),
  "utf8",
);
const packedConsumerHtml = readFileSync(
  new URL("../../../fixtures/packed-consumer/index.html", import.meta.url),
  "utf8",
);

describe("standalone host adaptivity", () => {
  it("leaves browser zoom unrestricted in both executable examples", () => {
    for (const html of [playgroundHtml, packedConsumerHtml]) {
      expect(html).toContain('content="width=device-width, initial-scale=1.0"');
      expect(html).not.toMatch(/(?:maximum-scale|user-scalable)/u);
    }
  });

  it("reflows host chrome at the content breakpoint used by 200% zoom", () => {
    for (const stylesheet of [playgroundStyles, packedConsumerStyles]) {
      expect(stylesheet).toContain("@media (max-width: 60rem)");
      expect(stylesheet).toContain("flex-wrap: wrap");
      expect(stylesheet).toContain("min-width: 0");
    }

    expect(playgroundStyles).toContain("min-height: 3.25rem");
    expect(playgroundStyles).toContain("height: 2.5rem");
    expect(playgroundStyles).toContain(".playground-toolbar-label");
    expect(packedConsumerStyles).toContain("min-height: 2.75rem");
  });

  it("keeps the 320px host shell compact without introducing page scrolling", () => {
    expect(playgroundStyles).toContain("@media (max-width: 40rem)");
    expect(playgroundStyles).toContain("overflow: hidden");
    expect(playgroundStyles).toContain("padding: 0.5rem 0 0");
    expect(playgroundStyles).toContain("margin-inline: 0.5rem");
    expect(packedConsumerStyles).toContain("@media (max-width: 40rem)");
    expect(packedConsumerStyles).toContain("overflow: hidden");
    expect(packedConsumerStyles).toContain("padding: 0.5rem");
  });

  it("keeps registered host-pane copy readable in both package appearances", () => {
    expect(playgroundStyles).toContain(".playground-host-pane");
    expect(packedConsumerStyles).toContain(".consumer-host-pane");
    for (const stylesheet of [playgroundStyles, packedConsumerStyles]) {
      expect(stylesheet).toContain("color: hsl(219, 26%, 23%)");
      expect(stylesheet).toContain("color: hsl(219, 25%, 77%)");
    }
  });
});
