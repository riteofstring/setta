import { parseGpuHexColor } from "./gpuColors";
import type { HtmlSurfaceColor } from "./htmlSurfaces/visualScene";

export function parseGpuRetainedContentNativeVisualColor(
  color: string,
  subject: string,
): HtmlSurfaceColor {
  const trimmed = color.trim();
  if (trimmed.startsWith("#")) {
    return toHtmlSurfaceColor(parseGpuHexColor(trimmed, subject));
  }
  const rgb = parseRgbColor(trimmed);
  if (rgb) {
    return rgb;
  }
  const hsl = parseHslColor(trimmed);
  if (hsl) {
    return hsl;
  }
  throw new Error(
    `Setta GPU ${subject} requires a supported CSS color, got ${JSON.stringify(
      color,
    )}.`,
  );
}

function parseRgbColor(color: string): HtmlSurfaceColor | null {
  const match =
    /^rgb\(\s*(?<red>\d+(?:\.\d+)?)\s*,\s*(?<green>\d+(?:\.\d+)?)\s*,\s*(?<blue>\d+(?:\.\d+)?)\s*\)$/iu.exec(
      color,
    );
  if (!match?.groups) {
    return null;
  }
  return {
    a: 1,
    b: clampByte(Number(match.groups.blue)) / 255,
    g: clampByte(Number(match.groups.green)) / 255,
    r: clampByte(Number(match.groups.red)) / 255,
  };
}

function parseHslColor(color: string): HtmlSurfaceColor | null {
  const match =
    /^hsl\(\s*(?<hue>-?\d+(?:\.\d+)?)\s*,\s*(?<saturation>\d+(?:\.\d+)?)%\s*,\s*(?<lightness>\d+(?:\.\d+)?)%\s*\)$/iu.exec(
      color,
    );
  if (!match?.groups) {
    return null;
  }
  const hue = normalizeHue(Number(match.groups.hue));
  const saturation = clampUnit(Number(match.groups.saturation) / 100);
  const lightness = clampUnit(Number(match.groups.lightness) / 100);
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hueSegment = hue / 60;
  const x = chroma * (1 - Math.abs((hueSegment % 2) - 1));
  const m = lightness - chroma / 2;
  const [red, green, blue] =
    hueSegment < 1
      ? [chroma, x, 0]
      : hueSegment < 2
        ? [x, chroma, 0]
        : hueSegment < 3
          ? [0, chroma, x]
          : hueSegment < 4
            ? [0, x, chroma]
            : hueSegment < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return {
    a: 1,
    b: blue + m,
    g: green + m,
    r: red + m,
  };
}

function toHtmlSurfaceColor(
  color: readonly [red: number, green: number, blue: number, alpha: number],
): HtmlSurfaceColor {
  return {
    a: color[3],
    b: color[2],
    g: color[1],
    r: color[0],
  };
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(
      "Setta GPU retained native visual color channel must be finite.",
    );
  }
  return Math.min(255, Math.max(0, value));
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(
      "Setta GPU retained native visual color channel must be finite.",
    );
  }
  return Math.min(1, Math.max(0, value));
}

function normalizeHue(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(
      "Setta GPU retained native visual color hue must be finite.",
    );
  }
  return ((value % 360) + 360) % 360;
}
