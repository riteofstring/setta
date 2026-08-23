import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { useNodeInternals } from "../document/stores";
import type { SectionSizeValue, WorkspaceSection } from "../document/types";
import { useSectionRefs } from "../section/sectionRefs";
import { persistSectionSizeChange } from "../section/sectionSizes";
import { useWorkspaceHost } from "../workspaceHostContext";

function parseSectionSizeValue(
  rawValue: string,
  field: "height" | "width",
):
  | { ok: true; value: SectionSizeValue }
  | { ok: false; field: "height" | "width"; message: string } {
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "auto") {
    return { ok: true, value: "auto" };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    return {
      ok: false,
      field,
      message: `${field} must be auto or a positive number.`,
    };
  }
  return { ok: true, value };
}

function formatResolvedSizeValue(
  authored: SectionSizeValue,
  resolved: number | null,
): string {
  const authoredText = authored === "auto" ? "Auto" : `${authored}px`;
  return resolved === null || authored !== "auto"
    ? authoredText
    : `${authoredText} (${Math.round(resolved)}px resolved)`;
}

type SectionSizeError = { field: "height" | "width"; message: string };
type ParsedSectionSize =
  | { ok: true; width: SectionSizeValue; height: SectionSizeValue }
  | { ok: false; error: SectionSizeError };

function parseSectionSizeDraft(
  width: string,
  height: string,
): ParsedSectionSize {
  const nextWidth = parseSectionSizeValue(width, "width");
  if (!nextWidth.ok) {
    return { ok: false, error: nextWidth };
  }
  const nextHeight = parseSectionSizeValue(height, "height");
  if (!nextHeight.ok) {
    return { ok: false, error: nextHeight };
  }
  return { ok: true, width: nextWidth.value, height: nextHeight.value };
}

function focusSectionSizeField(
  form: HTMLFormElement,
  field: "height" | "width",
): void {
  const target = form.elements.namedItem(field);
  if (!(target instanceof HTMLElement)) {
    throw new Error(`Workspace Inspector ${field} field is not mounted.`);
  }
  target.focus();
}

function getResolvedSectionSize(
  nodeValue: number | null | undefined,
  sectionElement: HTMLElement | null,
  field: "height" | "width",
): number | null {
  if (nodeValue !== null && nodeValue !== undefined) {
    return nodeValue;
  }
  if (!sectionElement) {
    return null;
  }
  return sectionElement.getBoundingClientRect()[field];
}

function SectionSizeField({
  canEditLayout,
  error,
  errorId,
  field,
  onChange,
  onKeyDown,
  value,
}: {
  canEditLayout: boolean;
  error: SectionSizeError | null;
  errorId: string;
  field: "height" | "width";
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  value: string;
}) {
  const invalid = error?.field === field;
  return (
    <label>
      <span>{field === "width" ? "Width" : "Height"}</span>
      <input
        aria-describedby={invalid ? errorId : undefined}
        aria-invalid={invalid ? true : undefined}
        className="setta-workspace-inspector-input"
        disabled={!canEditLayout}
        name={field}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        value={value}
      />
    </label>
  );
}

export function SectionSizeEditor({
  onEscape,
  onStatusChange,
  section,
}: {
  onEscape: () => void;
  onStatusChange: (message: string) => void;
  section: WorkspaceSection;
}) {
  const host = useWorkspaceHost();
  const canEditLayout = useWorkspaceCapabilities(
    (state) => state.canEditLayout,
  );
  const canEditSize = canEditLayout && !section.positionAndSizeLocked;
  const node = useNodeInternals((state) => state.x.get(section.id));
  const sectionElement = useSectionRefs(
    (state) =>
      state.selfOnly[section.id] ?? state.withNested[section.id] ?? null,
  );
  const [width, setWidth] = useState(String(section.size.width));
  const [height, setHeight] = useState(String(section.size.height));
  const [error, setError] = useState<SectionSizeError | null>(null);
  const hasDraftChange =
    width !== String(section.size.width) ||
    height !== String(section.size.height);
  const resolvedWidth = getResolvedSectionSize(
    node?.width,
    sectionElement,
    "width",
  );
  const resolvedHeight = getResolvedSectionSize(
    node?.height,
    sectionElement,
    "height",
  );

  useEffect(() => {
    setWidth(String(section.size.width));
    setHeight(String(section.size.height));
    setError(null);
  }, [section.size.height, section.size.width]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = parseSectionSizeDraft(width, height);
    if (!parsed.ok) {
      setError(parsed.error);
      focusSectionSizeField(event.currentTarget, parsed.error.field);
      return;
    }
    setError(null);
    persistSectionSizeChange(host, section.id, {
      width: parsed.width,
      height: parsed.height,
    });
    onStatusChange(`Section size updated to ${width} by ${height}.`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setWidth(String(section.size.width));
    setHeight(String(section.size.height));
    setError(null);
    onEscape();
  }

  const errorId = `setta-inspector-size-${section.id}-error`;
  return (
    <form
      className="setta-workspace-inspector-size"
      data-inspector-focus-key="section-size"
      onSubmit={handleSubmit}
    >
      <h4>Size</h4>
      <div className="setta-workspace-inspector-size-fields">
        <SectionSizeField
          canEditLayout={canEditSize}
          error={error}
          errorId={errorId}
          field="width"
          onChange={setWidth}
          onKeyDown={handleKeyDown}
          value={width}
        />
        <SectionSizeField
          canEditLayout={canEditSize}
          error={error}
          errorId={errorId}
          field="height"
          onChange={setHeight}
          onKeyDown={handleKeyDown}
          value={height}
        />
      </div>
      {error ? (
        <p className="setta-workspace-inspector-error" id={errorId}>
          {error.message}
        </p>
      ) : null}
      <div className="setta-workspace-inspector-resolved-size">
        <span>
          {formatResolvedSizeValue(section.size.width, resolvedWidth)}
        </span>
        <span>
          {formatResolvedSizeValue(section.size.height, resolvedHeight)}
        </span>
      </div>
      <button
        className="setta-workspace-inspector-primary-action"
        disabled={!canEditSize || !hasDraftChange}
        type="submit"
      >
        Apply size
      </button>
    </form>
  );
}
