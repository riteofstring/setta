import { useId, type KeyboardEvent } from "react";
import { useWorkspaceCapabilities } from "../document/capabilities";
import type { WorkspaceSection } from "../document/types";
import type { WorkspaceSectionTagColorPalette } from "../section/sectionTagColors";
import { setSectionTagColor } from "../section/tagColorAction";
import { useWorkspaceHost } from "../workspaceHostContext";

const RESET_BUTTON_CLASS_NAME =
  "rounded-full border border-setta-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-setta-600 shadow-sm hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:hover:bg-setta-850";

function getTagColorDescription(
  palette: WorkspaceSectionTagColorPalette,
  tagColor: string,
): string {
  return (
    palette.find((choice) => choice.color === tagColor)?.description ?? "Custom"
  );
}

function TagColorPreview({ tagColor }: { tagColor: string | null }) {
  if (tagColor === null) {
    return (
      <span
        aria-hidden="true"
        className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white text-[10px] font-bold text-setta-500 ring-1 ring-black/10 dark:bg-setta-800 dark:text-setta-400 dark:ring-white/10"
      >
        &ndash;
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
      style={{ backgroundColor: tagColor }}
    />
  );
}

export function SectionTagColorEditor({
  onEscape,
  onStatusChange,
  palette,
  section,
}: {
  onEscape: () => void;
  onStatusChange: (message: string) => void;
  palette: WorkspaceSectionTagColorPalette;
  section: WorkspaceSection;
}) {
  const host = useWorkspaceHost();
  const canEditLayout = useWorkspaceCapabilities(
    (state) => state.canEditLayout,
  );
  const disabled = !canEditLayout || section.positionAndSizeLocked;
  const inputId = `setta-inspector-section-tag-${useId().replaceAll(":", "")}`;
  const descriptionId = `${inputId}-description`;
  const customColor =
    section.tagColor !== null &&
    !palette.some((choice) => choice.color === section.tagColor)
      ? section.tagColor
      : null;
  const currentDescription =
    section.tagColor === null
      ? "None"
      : getTagColorDescription(palette, section.tagColor);

  function updateTagColor(tagColor: string | null): void {
    setSectionTagColor(host, section.id, tagColor);
    onStatusChange(
      tagColor === null
        ? "Section color tag cleared."
        : `Section color tag set to ${getTagColorDescription(palette, tagColor)} (${tagColor}).`,
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLSelectElement>): void {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onEscape();
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-lg bg-setta-100/70 px-3 py-2 dark:bg-setta-900/60"
      data-inspector-focus-key="section-tag-color"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <label
          className="min-w-0 text-xs font-bold uppercase tracking-wide text-setta-600 dark:text-setta-400"
          htmlFor={inputId}
        >
          Color tag
        </label>
        <button
          aria-label="Reset color tag to none"
          className={RESET_BUTTON_CLASS_NAME}
          data-setta-workspace-touch-target="compact"
          disabled={disabled || section.tagColor === null}
          onClick={() => updateTagColor(null)}
          type="button"
        >
          Reset
        </button>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <TagColorPreview tagColor={section.tagColor} />
        <select
          aria-describedby={descriptionId}
          className="setta-workspace-inspector-input min-w-0 flex-1"
          disabled={disabled}
          id={inputId}
          onChange={(event) =>
            updateTagColor(event.currentTarget.value || null)
          }
          onKeyDown={handleKeyDown}
          value={section.tagColor ?? ""}
        >
          <option value="">None</option>
          {customColor === null ? null : (
            <option value={customColor}>Custom ({customColor})</option>
          )}
          {palette.map((choice) => (
            <option key={choice.color} value={choice.color}>
              {choice.description}
            </option>
          ))}
        </select>
      </div>
      <p
        className="m-0 min-w-0 truncate font-mono text-[11px] text-setta-600 dark:text-setta-400"
        id={descriptionId}
      >
        {section.tagColor === null
          ? "None · no tag color"
          : `${currentDescription} · ${section.tagColor}`}
      </p>
    </div>
  );
}
