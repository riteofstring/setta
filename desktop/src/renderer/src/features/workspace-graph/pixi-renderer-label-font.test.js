import { readFileSync } from "node:fs";
import { URL } from "node:url";

import { describe, expect, it } from "vitest";

import { initialNodes } from "./pixi-renderer-fixture";
import {
  nodeLabelBitmapFontFamily,
  nodeLabelBitmapFontSize,
  nodeLabelBitmapFontUrl,
  compactSelectedNodeLabelBitmapFontSize,
  supportedNodeLabelGlyphs,
  validateNodeLabelGlyphs,
} from "./pixi-renderer-label-font";

describe("Pixi renderer label font", () => {
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

  it("commits a BMFont descriptor that matches the renderer label contract", () => {
    const descriptorUrl = new URL(
      "../../../public/fonts/inter-msdf/InterMSDF.fnt",
      import.meta.url,
    );
    const descriptor = parseBitmapFontDescriptor(readFileSync(descriptorUrl, "utf8"));

    expect(descriptor.info.face).toBe(nodeLabelBitmapFontFamily);
    expect(descriptor.info.size).toBe("48");
    expect(descriptor.pages).toEqual([{ file: "InterMSDF.png", id: "0" }]);
    expect(descriptor.distanceField).toEqual({ distanceRange: "4", fieldType: "msdf" });
    expect(Number(descriptor.chars.count)).toBe(supportedNodeLabelGlyphs.length);
  });
});

function parseBitmapFontDescriptor(xml) {
  return {
    chars: attributesForRequiredTag(xml, "chars"),
    distanceField: attributesForRequiredTag(xml, "distanceField"),
    info: attributesForRequiredTag(xml, "info"),
    pages: attributesForTags(xml, "page"),
  };
}

function attributesForRequiredTag(xml, tagName) {
  const [attributes] = attributesForTags(xml, tagName);
  if (!attributes) {
    throw new Error(`BMFont descriptor is missing <${tagName}>`);
  }
  return attributes;
}

function attributesForTags(xml, tagName) {
  return Array.from(xml.matchAll(new RegExp(`<${tagName}\\s+([^>]*)>`, "gu")), (match) =>
    parseXmlAttributes(match[1]),
  );
}

function parseXmlAttributes(source) {
  return Object.fromEntries(
    Array.from(source.matchAll(/([A-Za-z][A-Za-z0-9_-]*)="([^"]*)"/gu), (match) => [
      match[1],
      match[2],
    ]),
  );
}
