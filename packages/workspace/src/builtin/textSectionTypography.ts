import type { CSSProperties } from "react";

// The reference's `buildTextBlockTypographyScale`: one authored base size drives the rendered
// body, code, and heading sizes so a text section scales as a whole rather than through six
// independent options. The reference publishes the result as CSS custom properties its Tailwind
// typography variants read; the package keeps that mechanism, because the rendered surface is
// the same `prose` composition.

type WorkspaceTextTypographyScale = {
  bodyPx: number;
  codePx: number;
  h1Px: number;
  h2Px: number;
  h3Px: number;
  h4Px: number;
  h5Px: number;
  h6Px: number;
};

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildWorkspaceTextTypographyScale(
  fontSizePx: number,
): WorkspaceTextTypographyScale {
  return {
    bodyPx: roundToTenth(fontSizePx),
    codePx: roundToTenth(fontSizePx * 0.92),
    h1Px: roundToTenth(fontSizePx * 2.0),
    h2Px: roundToTenth(fontSizePx * 1.6),
    h3Px: roundToTenth(fontSizePx * 1.35),
    h4Px: roundToTenth(fontSizePx * 1.18),
    h5Px: roundToTenth(fontSizePx * 1.04),
    h6Px: roundToTenth(fontSizePx * 0.95),
  };
}

export function getWorkspaceTextTypographyStyle(
  scale: WorkspaceTextTypographyScale,
): CSSProperties {
  return {
    "--setta-workspace-text-body-size": `${String(scale.bodyPx)}px`,
    "--setta-workspace-text-code-size": `${String(scale.codePx)}px`,
    "--setta-workspace-text-h1-size": `${String(scale.h1Px)}px`,
    "--setta-workspace-text-h2-size": `${String(scale.h2Px)}px`,
    "--setta-workspace-text-h3-size": `${String(scale.h3Px)}px`,
    "--setta-workspace-text-h4-size": `${String(scale.h4Px)}px`,
    "--setta-workspace-text-h5-size": `${String(scale.h5Px)}px`,
    "--setta-workspace-text-h6-size": `${String(scale.h6Px)}px`,
  } as CSSProperties;
}
