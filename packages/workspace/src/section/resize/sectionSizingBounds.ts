import type { SectionSize, SectionSizeValue } from "../../document/types";

// The shipped generic section safety envelope from main's sectionSizingPolicy. Registered kinds
// may narrow this range, but they cannot create a size outside it.
export const SECTION_SIZING_POLICY = {
  minHeight: 0,
  maxHeight: 100_000,
  minWidth: 200,
  maxWidth: 100_000,
  minimizedHeight: 32,
  autoMaxHeight: 350,
} as const;

export type WorkspaceSectionSizeConstraints = Readonly<{
  minHeight: number;
  maxHeight: number;
  minWidth: number;
  maxWidth: number;
}>;

type WorkspaceSectionSizeBounds = Readonly<{
  minHeight: number;
  maxHeight: number;
  minWidth: number;
  maxWidth: number;
}>;

type MinimumSize = Readonly<{ width: number; height: number }>;

const UNCONSTRAINED_SIZE_CONSTRAINTS: WorkspaceSectionSizeConstraints = {
  minHeight: 0,
  maxHeight: SECTION_SIZING_POLICY.maxHeight,
  minWidth: 0,
  maxWidth: SECTION_SIZING_POLICY.maxWidth,
};

const NO_INTRINSIC_MINIMUM_SIZE: MinimumSize = { width: 0, height: 0 };

// Resolves the one effective envelope used by registered-kind geometry. The optional intrinsic
// minimum is for package-owned meta controls; ordinary kinds contribute only their registered
// consumer-neutral constraints.
export function getWorkspaceSectionSizeBounds(
  constraints?: WorkspaceSectionSizeConstraints,
  minimumSize?: MinimumSize,
): WorkspaceSectionSizeBounds {
  const registeredConstraints = constraints ?? UNCONSTRAINED_SIZE_CONSTRAINTS;
  const intrinsicMinimumSize = minimumSize ?? NO_INTRINSIC_MINIMUM_SIZE;
  return {
    minHeight: Math.max(
      SECTION_SIZING_POLICY.minHeight,
      registeredConstraints.minHeight,
      intrinsicMinimumSize.height,
    ),
    maxHeight: Math.min(
      SECTION_SIZING_POLICY.maxHeight,
      registeredConstraints.maxHeight,
    ),
    minWidth: Math.max(
      SECTION_SIZING_POLICY.minWidth,
      registeredConstraints.minWidth,
      intrinsicMinimumSize.width,
    ),
    maxWidth: Math.min(
      SECTION_SIZING_POLICY.maxWidth,
      registeredConstraints.maxWidth,
    ),
  };
}

function clampSizeValue(
  value: SectionSizeValue,
  minimum: number,
  maximum: number,
): SectionSizeValue {
  return typeof value === "number"
    ? Math.min(Math.max(value, minimum), maximum)
    : value;
}

// A document boundary normalizes numeric persisted/default dimensions before publishing them.
// Automatic dimensions remain automatic and receive the same limits from the rendered resizable.
export function clampWorkspaceSectionSize(
  size: SectionSize,
  bounds: WorkspaceSectionSizeBounds,
): SectionSize {
  return {
    width: clampSizeValue(size.width, bounds.minWidth, bounds.maxWidth),
    height: clampSizeValue(size.height, bounds.minHeight, bounds.maxHeight),
  };
}
