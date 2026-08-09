import { getSectionOrThrow } from "../../document/documentSelectors";
import { toggleMinimized } from "../../document/sectionMutations";
import { useWorkspaceDocument } from "../../document/stores";
import { getWorkspaceTooltipHandlers } from "../../tooltip/WorkspaceTooltip";

// The reference's `MinimizeButton` (css.gg minus/maximize glyphs). Roots never minimize in the
// reference, so the container only renders this for leaf sections.
type MinimizeButtonProps = {
  sectionId: string;
  hasSectionStyleTheme?: boolean;
};

export function MinimizeButton({ sectionId, hasSectionStyleTheme = false }: MinimizeButtonProps) {
  const isMinimized = useWorkspaceDocument((x) => getSectionOrThrow(x, sectionId).isMinimized);
  const label = isMinimized ? "Expand section" : "Minimize section";

  const colorClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)] hover:bg-[color:var(--setta-section-style-bg)] hover:text-[color:var(--setta-section-style-outline)] focus-visible:ring-[var(--setta-section-style-outline)]"
    : "text-setta-600 hover:bg-blue-500 hover:text-white";

  return (
    <button
      className={`focus-visible:ring-2 inline-flex items-center nodrag justify-content-center me-1 flex h-4 w-4 cursor-pointer justify-center rounded-full bg-transparent p-0 ${colorClassName}`}
      aria-label={label}
      onClick={() => toggleMinimized(sectionId)}
      title={label}
      type="button"
      data-setta-workspace-touch-target="compact"
      {...getWorkspaceTooltipHandlers({ content: label })}
    >
      {!isMinimized ? (
        <i aria-hidden="true" className="gg-math-minus" />
      ) : (
        <i aria-hidden="true" className="gg-maximize !scale-[.4]" />
      )}
    </button>
  );
}
