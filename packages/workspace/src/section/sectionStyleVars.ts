// Extracted from `resolveSectionStyleVars` in the frozen reference's SectionContainerCore.tsx.
// The reference's arg-handle/agentic-handle variables feed edge-handle CSS that is outside the
// approved slice, so only the six core section-style variables remain.
import { deriveSectionStyleTheme } from "./sectionStyleColors";

export type SectionStyleVars = Record<`--setta-section-style-${string}`, string>;

export function resolveSectionStyleVars(
  sectionStyleTheme: ReturnType<typeof deriveSectionStyleTheme>,
): SectionStyleVars | undefined {
  if (!sectionStyleTheme) {
    return undefined;
  }
  return {
    "--setta-section-style-bg": sectionStyleTheme.bg,
    "--setta-section-style-panel-bg": sectionStyleTheme.panelBg,
    "--setta-section-style-border": sectionStyleTheme.border,
    "--setta-section-style-outline": sectionStyleTheme.outline,
    "--setta-section-style-text": sectionStyleTheme.text,
    "--setta-section-style-muted-text": sectionStyleTheme.mutedText,
  };
}
