import type { LensChart } from "./EChartSurface";

type NormalizedChartBounds = Readonly<{
  bottom: number;
  left: number;
  right: number;
  top: number;
}>;

export type ChartSelectionGesture = Readonly<{
  additive: boolean;
  bounds: NormalizedChartBounds;
}>;

type ChartPixelBounds = Readonly<{
  bottom: number;
  left: number;
  right: number;
  top: number;
}>;

type ChartPixelRectangle = Readonly<{
  bottom: number;
  left: number;
  right: number;
  top: number;
}>;

export function chartGesturePixelBounds(
  gesture: ChartSelectionGesture,
  chart: LensChart,
): ChartPixelBounds {
  const left = gesture.bounds.left * chart.getWidth();
  const right = gesture.bounds.right * chart.getWidth();
  const top = gesture.bounds.top * chart.getHeight();
  const bottom = gesture.bounds.bottom * chart.getHeight();
  return {
    bottom,
    left,
    right,
    top,
  };
}

export function chartDataPixel(
  chart: LensChart,
  coordinate: readonly [number, number],
): readonly [number, number] | null {
  const pixel = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [
    coordinate[0],
    coordinate[1],
  ]);
  if (
    !Array.isArray(pixel) ||
    typeof pixel[0] !== "number" ||
    typeof pixel[1] !== "number" ||
    !Number.isFinite(pixel[0]) ||
    !Number.isFinite(pixel[1])
  ) {
    return null;
  }
  return [pixel[0], pixel[1]];
}

export function pixelRectanglesIntersect(
  selection: ChartPixelBounds,
  target: ChartPixelRectangle,
): boolean {
  return (
    target.right >= selection.left &&
    target.left <= selection.right &&
    target.bottom >= selection.top &&
    target.top <= selection.bottom
  );
}

export function chartBandHalfSize(
  centers: readonly number[],
  index: number,
  maximum: number,
): number {
  const center = centers[index];
  if (center === undefined) {
    return 0;
  }
  const distances = [centers[index - 1], centers[index + 1]]
    .filter((candidate): candidate is number => candidate !== undefined)
    .map((candidate) => Math.abs(candidate - center))
    .filter((distance) => distance > 0);
  const spacing = distances.length > 0 ? Math.min(...distances) : maximum * 2;
  return Math.min(maximum, spacing * 0.4);
}
