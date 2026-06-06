import { readFileSync } from "node:fs";
import { URL } from "node:url";

import { describe, expect, it } from "vitest";

import { initialNodes } from "./pixi-workspace-fixture";
import {
  nodeLabelBitmapFontFamily,
  nodeLabelBitmapFontSize,
  nodeLabelBitmapFontUrl,
  compactSelectedNodeLabelBitmapFontSize,
  supportedNodeLabelGlyphs,
  validateNodeLabelGlyphs,
} from "./pixi-workspace-label-font";

describe("pixi workspace label font", () => {
  it("accepts the fixture node labels", () => {
    for (const node of initialNodes) {
      expect(() => validateNodeLabelGlyphs(node.id, node.label)).not.toThrow();
    }
  });

  it("fails specifically when a node label contains an unsupported glyph", () => {
    const unsupportedLabel = `Source ${String.fromCodePoint(0x1f680)}`;

    expect(() => validateNodeLabelGlyphs("source", unsupportedLabel)).toThrow(
      /unsupported glyph U\+1F680/,
    );
  });

  it("exposes the committed bitmap font target", () => {
    expect(nodeLabelBitmapFontFamily).toBe("InterMSDF");
    expect(nodeLabelBitmapFontSize).toBe(16);
    expect(compactSelectedNodeLabelBitmapFontSize).toBe(12);
    expect(nodeLabelBitmapFontUrl).toBe("fonts/inter-msdf/InterMSDF.fnt");
    expect(supportedNodeLabelGlyphs).toContain("A");
  });

  it("commits an XML BMFont descriptor that Pixi can parse with MSDF metadata", () => {
    const descriptorUrl = new URL("../../public/fonts/inter-msdf/InterMSDF.fnt", import.meta.url);
    const descriptor = readFileSync(descriptorUrl, "utf8");

    expect(descriptor).toContain("<font>");
    expect(descriptor).toContain('<info face="InterMSDF" size="48"');
    expect(descriptor).toContain('<page id="0" file="InterMSDF.png"/>');
    expect(descriptor).toContain('<distanceField fieldType="msdf" distanceRange="4"/>');
    expect(descriptor).toContain('<chars count="95">');
  });
});
