export type GpuRgbaColor = readonly [
  red: number,
  green: number,
  blue: number,
  alpha: number,
];

export function parseGpuHexColor(color: string, subject: string): GpuRgbaColor {
  const trimmed = color.trim();
  const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(trimmed);
  if (!match) {
    throw new Error(
      `Setta GPU ${subject} requires a hex color, got ${JSON.stringify(
        color,
      )}.`,
    );
  }
  const hex = match[1];
  if (!hex) {
    throw new Error(
      `Setta GPU ${subject} requires a hex color, got ${JSON.stringify(
        color,
      )}.`,
    );
  }
  if (hex.length === 3 || hex.length === 4) {
    const red = parseHexNibblePair(hex.charAt(0));
    const green = parseHexNibblePair(hex.charAt(1));
    const blue = parseHexNibblePair(hex.charAt(2));
    const alpha = hex.length === 4 ? parseHexNibblePair(hex.charAt(3)) : 255;
    return [red / 255, green / 255, blue / 255, alpha / 255];
  }
  const red = parseHexByte(hex.slice(0, 2));
  const green = parseHexByte(hex.slice(2, 4));
  const blue = parseHexByte(hex.slice(4, 6));
  const alpha = hex.length === 8 ? parseHexByte(hex.slice(6, 8)) : 255;
  return [red / 255, green / 255, blue / 255, alpha / 255];
}

function parseHexByte(value: string): number {
  return Number.parseInt(value, 16);
}

function parseHexNibblePair(value: string): number {
  return parseHexByte(value + value);
}
