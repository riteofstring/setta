import { deriveSectionStyleTheme } from "./sectionStyleColors";

type SectionStyleVars = Record<`--setta-section-style-${string}`, string>;

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
    "--setta-section-style-arg-handle": sectionStyleTheme.border,
    "--setta-section-style-arg-handle-hover": sectionStyleTheme.outline,
    "--setta-section-style-arg-handle-active": sectionStyleTheme.border,
    "--setta-section-style-agentic-handle": sectionStyleTheme.outline,
  };
}
