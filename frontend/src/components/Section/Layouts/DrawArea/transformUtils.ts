import { DrawAreaTransform } from "utils/generatedTypes";

type Point = [number, number];

const IDENTITY_TRANSFORM: DrawAreaTransform = [1, 0, 0, 1, 0, 0];

export function multiplyTransforms(
  a: DrawAreaTransform,
  b: DrawAreaTransform,
): DrawAreaTransform {
  const [a1, b1, c1, d1, e1, f1] = a;
  const [a2, b2, c2, d2, e2, f2] = b;

  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function invertTransform(
  transform: DrawAreaTransform,
): DrawAreaTransform | null {
  const [a, b, c, d, e, f] = transform;
  const det = a * d - b * c;

  if (Math.abs(det) < 1e-9) {
    return null;
  }

  const invA = d / det;
  const invB = -b / det;
  const invC = -c / det;
  const invD = a / det;
  const invE = -(invA * e + invC * f);
  const invF = -(invB * e + invD * f);

  return [invA, invB, invC, invD, invE, invF];
}

export function applyTransformToPoint(
  transform: DrawAreaTransform,
  point: Point,
): Point {
  const [a, b, c, d, e, f] = transform;
  const [x, y] = point;
  return [a * x + c * y + e, b * x + d * y + f];
}

export function applyTransformToVector(
  transform: DrawAreaTransform,
  vector: Point,
): Point {
  const [a, b, c, d] = transform;
  const [x, y] = vector;
  return [a * x + c * y, b * x + d * y];
}

export function getIdentityTransform(): DrawAreaTransform {
  return [...IDENTITY_TRANSFORM];
}
