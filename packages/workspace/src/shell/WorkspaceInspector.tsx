import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { FiEdit3 } from "react-icons/fi";
import { HiChevronDown } from "react-icons/hi2";
import { createSectionCommandContext } from "../commands/workspaceCommandContexts";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { isGroupSection } from "../document/documentSelectors";
import {
  createWorkspaceInspectorContributionContext,
  getRegisteredSectionKindOrThrow,
} from "../document/sectionKindRegistry";
import {
  setSectionName,
  setSectionsPositionLocked,
  setSectionStyleColor,
  toggleGroupOrientation,
  toggleMinimized,
} from "../document/sectionMutations";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import type { SectionSizeValue, WorkspaceSection } from "../document/types";
import { setGroupOverflowMode } from "../section/groupOverflowAction";
import { useSectionRefs } from "../section/sectionRefs";
import { persistSectionSizeChange } from "../section/sectionSizes";
import {
  resolveSectionTagColorPalette,
  type WorkspaceSectionTagColorPalette,
} from "../section/sectionTagColors";
import { SectionTagColorEditor } from "./SectionTagColorEditor";
import { WorkspaceInspectorCommandActions } from "./WorkspaceInspectorCommandActions";
import {
  getWorkspaceInspectorLockState,
  getWorkspaceInspectorSelection,
  getWorkspaceInspectorSelectionKey,
  getWorkspaceInspectorSelectionStatus,
  type WorkspaceInspectorSelection,
} from "./workspaceInspectorModel";
import { WorkspaceItemInspector } from "./WorkspaceItemInspector";
import { useWorkspaceHost } from "../workspaceHostContext";

type WorkspaceInspectorProps = {
  ariaLabel?: string;
  initialFocusRef: RefObject<HTMLElement | null>;
  sectionTagColorPalette: WorkspaceSectionTagColorPalette;
  sectionOnly?: boolean;
};

export type WorkspaceSectionEditorProps = {
  // The shell can direct its first programmatic focus to this editor without the host needing
  // access to the package's selection or focus stores.
  initialFocusRef?: RefObject<HTMLElement | null>;
  // Omit for the package palette. Hosts can provide their complete supported choice set.
  sectionTagColorPalette?: WorkspaceSectionTagColorPalette;
};

type CommitTextFieldProps = {
  disabled: boolean;
  focusKey: string;
  label: string;
  onCommit: (value: string) => void;
  onEscape: () => void;
  onStatusChange: (message: string) => void;
  statusMessage: (value: string) => string;
  validate?: (value: string) => string | null;
  value: string;
};

function CommitTextField({
  disabled,
  focusKey,
  label,
  onCommit,
  onEscape,
  onStatusChange,
  statusMessage,
  validate,
  value,
}: CommitTextFieldProps) {
  const reactId = useId().replaceAll(":", "");
  const inputId = `setta-inspector-${focusKey}-${reactId}`;
  const errorId = `${inputId}-error`;
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const skipBlurRef = useRef(false);

  useEffect(() => {
    setDraft(value);
    setError(null);
  }, [value]);

  function commit(): void {
    const errorMessage = validate?.(draft) ?? null;
    if (errorMessage) {
      setError(errorMessage);
      return;
    }
    setError(null);
    if (draft !== value) {
      onCommit(draft);
      onStatusChange(statusMessage(draft));
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    skipBlurRef.current = true;
    setDraft(value);
    setError(null);
    onEscape();
  }

  return (
    <div
      className="setta-workspace-inspector-field"
      data-inspector-focus-key={focusKey}
    >
      <label className="setta-workspace-inspector-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        className="setta-workspace-inspector-input"
        disabled={disabled}
        id={inputId}
        onBlur={() => {
          if (skipBlurRef.current) {
            skipBlurRef.current = false;
            return;
          }
          commit();
        }}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        value={draft}
      />
      {error ? (
        <p className="setta-workspace-inspector-error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

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

function SectionSizeEditor({
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

function SectionContribution({
  includeUnsupportedMessage,
  section,
}: {
  includeUnsupportedMessage: boolean;
  section: WorkspaceSection;
}) {
  const host = useWorkspaceHost();
  if (isGroupSection(section)) {
    return null;
  }
  const contribution = getRegisteredSectionKindOrThrow(
    host,
    section.kind,
  ).renderInspector;
  if (contribution) {
    return (
      <div
        className="setta-workspace-inspector-contribution"
        data-inspector-focus-key="custom-section"
      >
        {contribution(
          createWorkspaceInspectorContributionContext({
            type: "section",
            section,
          }),
        )}
      </div>
    );
  }
  if (!includeUnsupportedMessage) {
    return null;
  }
  return (
    <div className="setta-workspace-inspector-unsupported" role="note">
      <h4>Custom section content</h4>
      <p>This section kind has no Inspector contribution.</p>
    </div>
  );
}

function InspectorSettingsGroup({
  children,
  defaultOpen,
  title,
}: {
  children: ReactNode;
  defaultOpen: boolean;
  title: string;
}) {
  return (
    <details
      className="setta-workspace-inspector-settings-group"
      open={defaultOpen || undefined}
    >
      <summary className="setta-workspace-inspector-settings-summary">
        <span>{title}</span>
        <HiChevronDown aria-hidden="true" size={16} />
      </summary>
      <div className="setta-workspace-inspector-settings-content">
        {children}
      </div>
    </details>
  );
}

const SECTION_APPEARANCE_ACTION_CLASS_NAME =
  "rounded-full border border-setta-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-setta-600 shadow-sm hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:hover:bg-setta-850";

function SectionStyleColorEditor({
  onStatusChange,
  section,
}: {
  onStatusChange: (message: string) => void;
  section: WorkspaceSection;
}) {
  const host = useWorkspaceHost();
  const canEditStructure = useWorkspaceCapabilities(
    (state) => state.canEditStructure,
  );
  const value = section.styleColor;

  function updateStyleColor(nextValue: string | null): void {
    setSectionStyleColor(host, section.id, nextValue);
    onStatusChange(
      nextValue === null
        ? "Section style accent cleared."
        : `Section style accent set to ${nextValue}.`,
    );
  }

  return (
    <div
      className="setta-workspace-inspector-appearance-card"
      data-inspector-focus-key="section-style"
    >
      <div className="setta-workspace-inspector-appearance-card-heading">
        <h3>Style</h3>
        <button
          aria-label="Reset style accent to default"
          className={SECTION_APPEARANCE_ACTION_CLASS_NAME}
          data-setta-workspace-touch-target="compact"
          disabled={!canEditStructure || value === null}
          onClick={() => updateStyleColor(null)}
          type="button"
        >
          Reset
        </button>
      </div>
      <div className="setta-workspace-inspector-appearance-value">
        <input
          aria-label="Style accent"
          className="setta-workspace-native-color setta-workspace-inspector-style-picker"
          disabled={!canEditStructure}
          onChange={(event) => updateStyleColor(event.currentTarget.value)}
          type="color"
          value={value ?? "#3b82f6"}
        />
        {value === null ? (
          <p>None</p>
        ) : (
          <div>
            <span aria-hidden="true" style={{ backgroundColor: value }} />
            <code>{value}</code>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionInspector({
  focusRoot,
  includeInspectorCommands,
  onStatusChange,
  sectionTagColorPalette,
  section,
}: {
  focusRoot: () => void;
  includeInspectorCommands: boolean;
  onStatusChange: (message: string) => void;
  sectionTagColorPalette: WorkspaceSectionTagColorPalette;
  section: WorkspaceSection;
}) {
  const host = useWorkspaceHost();
  const capabilities = useWorkspaceCapabilities((state) => state);
  const mainPresentation = !includeInspectorCommands;
  const nameField = (
    <CommitTextField
      disabled={!capabilities.canEditStructure}
      focusKey="section-name"
      label="Name"
      onCommit={(value) => setSectionName(host, section.id, value.trim())}
      onEscape={focusRoot}
      onStatusChange={onStatusChange}
      statusMessage={(value) =>
        `Section name changed to ${value.trim() || "blank"}.`
      }
      value={section.name}
    />
  );
  const layoutSettings = (
    <>
      <div className="setta-workspace-inspector-toggle-grid">
        <button
          aria-pressed={section.positionAndSizeLocked}
          className="setta-workspace-inspector-toggle"
          disabled={!capabilities.canEditLayout}
          onClick={() => {
            const nextLocked = !section.positionAndSizeLocked;
            setSectionsPositionLocked(host, [section.id], nextLocked);
            onStatusChange(
              nextLocked
                ? "Section position and size locked."
                : "Section position and size unlocked.",
            );
          }}
          type="button"
        >
          {section.positionAndSizeLocked
            ? "Position and size locked"
            : "Position and size unlocked"}
        </button>
        {includeInspectorCommands ? (
          <button
            aria-pressed={section.isMinimized}
            className="setta-workspace-inspector-toggle"
            onClick={() => {
              toggleMinimized(host, section.id);
              onStatusChange(
                section.isMinimized
                  ? "Section expanded."
                  : "Section minimized.",
              );
            }}
            type="button"
          >
            {section.isMinimized ? "Minimized" : "Expanded"}
          </button>
        ) : null}
        {isGroupSection(section) ? (
          <>
            <button
              aria-pressed={section.isHorizontalOrientation}
              className="setta-workspace-inspector-toggle"
              disabled={!capabilities.canEditLayout}
              onClick={() => {
                toggleGroupOrientation(host, section.id);
                onStatusChange(
                  section.isHorizontalOrientation
                    ? "Group children now stack vertically."
                    : "Group children now flow horizontally.",
                );
              }}
              type="button"
            >
              {section.isHorizontalOrientation ? "Horizontal" : "Vertical"}
            </button>
            <button
              aria-pressed={section.overflowMode}
              className="setta-workspace-inspector-toggle"
              disabled={
                !capabilities.canEditLayout || section.positionAndSizeLocked
              }
              onClick={() => {
                const nextOverflowMode = !section.overflowMode;
                setGroupOverflowMode(host, section.id, nextOverflowMode);
                onStatusChange(
                  nextOverflowMode
                    ? "Bounded overflow enabled."
                    : "Bounded overflow disabled.",
                );
              }}
              type="button"
            >
              Bounded overflow
            </button>
          </>
        ) : null}
      </div>
      <SectionSizeEditor
        onEscape={focusRoot}
        onStatusChange={onStatusChange}
        section={section}
      />
    </>
  );
  return (
    <div
      className="setta-workspace-inspector-editor"
      data-inspector-branch="section"
      data-main-presentation={mainPresentation || undefined}
    >
      {includeInspectorCommands ? (
        <>
          <div className="setta-workspace-inspector-section-heading">
            <h3>{section.name || section.id}</h3>
            <span>Section</span>
          </div>
          <div className="setta-workspace-inspector-readonly-row">
            <span>Kind</span>
            <span className="setta-workspace-inspector-readonly-value">
              {isGroupSection(section) ? "Group" : section.kind}
            </span>
          </div>
        </>
      ) : null}
      <InspectorSettingsGroup
        defaultOpen
        key={`${section.id}:section-settings`}
        title="Section Settings"
      >
        {mainPresentation ? (
          <div className="setta-workspace-section-config-fields">
            <section className="setta-workspace-section-config-card">
              <h4>Identity</h4>
              {nameField}
            </section>
            <section className="setta-workspace-section-config-card">
              <h4>Layout</h4>
              {layoutSettings}
            </section>
          </div>
        ) : (
          <>
            {nameField}
            {layoutSettings}
          </>
        )}
      </InspectorSettingsGroup>
      <InspectorSettingsGroup
        defaultOpen={false}
        key={`${section.id}:appearance`}
        title="Appearance"
      >
        {mainPresentation ? (
          <SectionStyleColorEditor
            onStatusChange={onStatusChange}
            section={section}
          />
        ) : (
          <CommitTextField
            disabled={!capabilities.canEditStructure}
            focusKey="section-style"
            label="Style accent"
            onCommit={(value) => setSectionStyleColor(host, section.id, value)}
            onEscape={focusRoot}
            onStatusChange={onStatusChange}
            statusMessage={(value) =>
              value.trim() === ""
                ? "Section style accent cleared."
                : `Section style accent set to ${value}.`
            }
            validate={(value) =>
              value.trim() === "" || /^#?[0-9a-f]{6}$/iu.test(value.trim())
                ? null
                : "Enter a six-digit hex color or leave this blank."
            }
            value={section.styleColor ?? ""}
          />
        )}
        <SectionTagColorEditor
          mainPresentation={mainPresentation}
          onEscape={focusRoot}
          onStatusChange={onStatusChange}
          palette={sectionTagColorPalette}
          section={section}
        />
      </InspectorSettingsGroup>
      {includeInspectorCommands ? (
        <>
          <WorkspaceInspectorCommandActions
            contexts={[createSectionCommandContext(host, section, [section])]}
            focusKey="section-actions"
            onStatusChange={onStatusChange}
            surface="inspector"
          />
          <WorkspaceInspectorCommandActions
            contexts={[createSectionCommandContext(host, section, [section])]}
            focusKey="item-authoring-actions"
            onStatusChange={onStatusChange}
            surface="inspector-parameters"
          />
        </>
      ) : null}
      <SectionContribution
        includeUnsupportedMessage={includeInspectorCommands}
        section={section}
      />
    </div>
  );
}

function MultipleSectionsInspector({
  onStatusChange,
  sections,
}: {
  onStatusChange: (message: string) => void;
  sections: Array<WorkspaceSection>;
}) {
  const host = useWorkspaceHost();
  const canEditLayout = useWorkspaceCapabilities(
    (state) => state.canEditLayout,
  );
  const lockState = getWorkspaceInspectorLockState(sections);
  const primarySection = sections[0];
  if (!primarySection) {
    throw new Error(
      "A multiple-section Inspector selection requires at least one section.",
    );
  }
  return (
    <div
      className="setta-workspace-inspector-editor"
      data-inspector-branch="multiple-sections"
    >
      <div className="setta-workspace-inspector-section-heading">
        <h3>{sections.length} sections</h3>
        <span>Multiple selection</span>
      </div>
      <div className="setta-workspace-inspector-readonly-row">
        <span>Position and size</span>
        <span className="setta-workspace-inspector-readonly-value">
          {lockState === "mixed"
            ? "Mixed"
            : lockState === "locked"
              ? "Locked"
              : "Unlocked"}
        </span>
      </div>
      <WorkspaceInspectorCommandActions
        contexts={[createSectionCommandContext(host, primarySection, sections)]}
        focusKey="section-actions"
        onStatusChange={onStatusChange}
        surface="inspector"
      >
        <button
          disabled={!canEditLayout}
          onClick={() => {
            const nextLocked = lockState !== "locked";
            setSectionsPositionLocked(
              host,
              sections.map((section) => section.id),
              nextLocked,
            );
            onStatusChange(
              nextLocked
                ? `${sections.length} sections locked.`
                : `${sections.length} sections unlocked.`,
            );
          }}
          type="button"
        >
          {lockState === "locked" ? "Unlock all" : "Lock all"}
        </button>
      </WorkspaceInspectorCommandActions>
    </div>
  );
}

function EmptyInspector() {
  return (
    <div
      className="setta-workspace-inspector-empty"
      data-inspector-branch="empty"
    >
      <FiEdit3 aria-hidden={true} focusable="false" />
      <h3>Select A Section to Edit</h3>
    </div>
  );
}

function MultipleItemsInspector({
  onStatusChange,
  selection,
}: {
  onStatusChange: (message: string) => void;
  selection: Extract<WorkspaceInspectorSelection, { type: "multiple-items" }>;
}) {
  const host = useWorkspaceHost();
  return (
    <div
      className="setta-workspace-inspector-editor"
      data-inspector-branch="multiple-items"
    >
      <div className="setta-workspace-inspector-unsupported" role="note">
        <h3>{selection.itemCount} items selected</h3>
        <p>Select one item to edit its label, UI type, and configuration.</p>
      </div>
      <WorkspaceInspectorCommandActions
        contexts={[
          createSectionCommandContext(host, selection.section, [
            selection.section,
          ]),
        ]}
        focusKey="item-authoring-actions"
        onStatusChange={onStatusChange}
        surface="inspector-parameters"
      />
    </div>
  );
}

function InspectorBranch({
  focusRoot,
  includeInspectorCommands,
  onStatusChange,
  selection,
  sectionTagColorPalette,
}: {
  focusRoot: () => void;
  includeInspectorCommands: boolean;
  onStatusChange: (message: string) => void;
  selection: WorkspaceInspectorSelection;
  sectionTagColorPalette: WorkspaceSectionTagColorPalette;
}) {
  switch (selection.type) {
    case "empty":
      return <EmptyInspector />;
    case "section":
      return (
        <SectionInspector
          focusRoot={focusRoot}
          includeInspectorCommands={includeInspectorCommands}
          onStatusChange={onStatusChange}
          sectionTagColorPalette={sectionTagColorPalette}
          section={selection.section}
        />
      );
    case "item":
      return (
        <WorkspaceItemInspector
          item={selection.item}
          onEscape={focusRoot}
          onStatusChange={onStatusChange}
          section={selection.section}
        />
      );
    case "multiple-items":
      return (
        <MultipleItemsInspector
          onStatusChange={onStatusChange}
          selection={selection}
        />
      );
    case "multiple-sections":
      return (
        <MultipleSectionsInspector
          onStatusChange={onStatusChange}
          sections={selection.sections}
        />
      );
  }
}

export function WorkspaceInspector({
  ariaLabel = "Workspace Inspector selection",
  initialFocusRef,
  sectionTagColorPalette,
  sectionOnly = false,
}: WorkspaceInspectorProps) {
  const documentState = useWorkspaceDocument((state) => state);
  const activeSectionIds = useActiveSections((state) => state.activeIds);
  const inspectorSelection = useMemo(
    () => getWorkspaceInspectorSelection(documentState, activeSectionIds),
    [activeSectionIds, documentState],
  );
  const selection = useMemo<WorkspaceInspectorSelection>(() => {
    if (!sectionOnly) {
      return inspectorSelection;
    }
    switch (inspectorSelection.type) {
      case "section":
      case "item":
        return { type: "section", section: inspectorSelection.section };
      case "empty":
      case "multiple-items":
      case "multiple-sections":
        return { type: "empty" };
    }
  }, [inspectorSelection, sectionOnly]);
  const selectionKey = getWorkspaceInspectorSelectionKey(selection);
  const rootRef = useRef<HTMLDivElement>(null);
  const branchRootRef = useRef<HTMLDivElement>(null);
  const ownsFocusRef = useRef(false);
  const lastFocusKeyRef = useRef<string | null>(null);
  const previousSelectionKeyRef = useRef(selectionKey);
  const [status, setStatus] = useState(() =>
    getWorkspaceInspectorSelectionStatus(selection),
  );

  function getLastMeaningfulFocus(): HTMLElement {
    const root = rootRef.current;
    const branchRoot = branchRootRef.current;
    if (!root || !branchRoot) {
      throw new Error("Workspace Inspector focus target is not mounted.");
    }
    const focusKey = lastFocusKeyRef.current;
    const focusOwner = focusKey
      ? [
          ...root.querySelectorAll<HTMLElement>("[data-inspector-focus-key]"),
        ].find((element) => element.dataset["inspectorFocusKey"] === focusKey)
      : null;
    return (
      focusOwner?.querySelector<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
      ) ?? branchRoot
    );
  }

  function focusRoot(): void {
    branchRootRef.current?.focus();
  }

  useLayoutEffect(() => {
    const focusTarget = getLastMeaningfulFocus();
    initialFocusRef.current = focusTarget;
    if (previousSelectionKeyRef.current !== selectionKey) {
      if (ownsFocusRef.current) {
        focusTarget.focus();
      }
      setStatus(getWorkspaceInspectorSelectionStatus(selection));
    }
    previousSelectionKeyRef.current = selectionKey;
  }, [initialFocusRef, selection, selectionKey]);

  useEffect(() => {
    return () => {
      initialFocusRef.current = null;
    };
  }, [initialFocusRef]);

  function handleFocus(event: FocusEvent<HTMLDivElement>): void {
    ownsFocusRef.current = true;
    const element =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-inspector-focus-key]")
        : null;
    lastFocusKeyRef.current =
      element?.dataset["inspectorFocusKey"] ?? lastFocusKeyRef.current;
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>): void {
    const nextTarget = event.relatedTarget;
    if (
      nextTarget instanceof Node &&
      event.currentTarget.contains(nextTarget)
    ) {
      return;
    }
    if (nextTarget !== null) {
      ownsFocusRef.current = false;
    }
  }

  return (
    <div
      className="setta-workspace-inspector"
      onBlurCapture={handleBlur}
      onFocusCapture={handleFocus}
      ref={rootRef}
    >
      <div
        aria-label={ariaLabel}
        className="setta-workspace-inspector-branch"
        data-inspector-branch-root="true"
        ref={branchRootRef}
        tabIndex={-1}
      >
        <InspectorBranch
          focusRoot={focusRoot}
          includeInspectorCommands={!sectionOnly}
          onStatusChange={setStatus}
          selection={selection}
          sectionTagColorPalette={sectionTagColorPalette}
        />
      </div>
      <p
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace-inspector-status sr-only"
        role="status"
      >
        {status}
      </p>
    </div>
  );
}

// A host-composed contextual rail uses this focused subset rather than reproducing package-owned
// section mutations. Item selection intentionally resolves to its owning section; typed item
// configuration remains the generic Inspector's separate branch.
export function WorkspaceSectionEditor({
  initialFocusRef: suppliedInitialFocusRef,
  sectionTagColorPalette,
}: WorkspaceSectionEditorProps) {
  const fallbackInitialFocusRef = useRef<HTMLElement>(null);
  const initialFocusRef = suppliedInitialFocusRef ?? fallbackInitialFocusRef;
  const resolvedSectionTagColorPalette = useMemo(
    () => resolveSectionTagColorPalette(sectionTagColorPalette),
    [sectionTagColorPalette],
  );
  return (
    <WorkspaceInspector
      ariaLabel="Workspace section settings"
      initialFocusRef={initialFocusRef}
      sectionOnly
      sectionTagColorPalette={resolvedSectionTagColorPalette}
    />
  );
}
