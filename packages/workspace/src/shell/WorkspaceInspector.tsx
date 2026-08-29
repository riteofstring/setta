import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
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
import { useActiveSections, useWorkspaceDocument } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import { setGroupOverflowMode } from "../section/groupOverflowAction";
import {
  resolveSectionTagColorPalette,
  type WorkspaceSectionTagColorPalette,
} from "../section/sectionTagColors";
import { SectionTagColorEditor } from "./SectionTagColorEditor";
import { SectionSizeEditor } from "./SectionSizeEditor";
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
  initialFocusRef?: RefObject<HTMLElement | null>;

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

type SectionEditorContentProps = {
  focusRoot: () => void;
  onStatusChange: (message: string) => void;
  section: WorkspaceSection;
};

function SectionNameField({
  focusRoot,
  onStatusChange,
  section,
}: SectionEditorContentProps) {
  const host = useWorkspaceHost();
  const canEditStructure = useWorkspaceCapabilities(
    (state) => state.canEditStructure,
  );
  return (
    <CommitTextField
      disabled={!canEditStructure}
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
}

function SectionLockToggle({
  onStatusChange,
  section,
}: Omit<SectionEditorContentProps, "focusRoot">) {
  const host = useWorkspaceHost();
  const canEditLayout = useWorkspaceCapabilities(
    (state) => state.canEditLayout,
  );
  function toggleLock(): void {
    const nextLocked = !section.positionAndSizeLocked;
    setSectionsPositionLocked(host, [section.id], nextLocked);
    onStatusChange(
      nextLocked
        ? "Section position and size locked."
        : "Section position and size unlocked.",
    );
  }
  return (
    <button
      aria-pressed={section.positionAndSizeLocked}
      className="setta-workspace-inspector-toggle"
      disabled={!canEditLayout}
      onClick={toggleLock}
      type="button"
    >
      {section.positionAndSizeLocked
        ? "Position and size locked"
        : "Position and size unlocked"}
    </button>
  );
}

function SectionMinimizeToggle({
  onStatusChange,
  section,
}: Omit<SectionEditorContentProps, "focusRoot">) {
  const host = useWorkspaceHost();
  function minimizeOrExpand(): void {
    toggleMinimized(host, section.id);
    onStatusChange(
      section.isMinimized ? "Section expanded." : "Section minimized.",
    );
  }
  return (
    <button
      aria-pressed={section.isMinimized}
      className="setta-workspace-inspector-toggle"
      onClick={minimizeOrExpand}
      type="button"
    >
      {section.isMinimized ? "Minimized" : "Expanded"}
    </button>
  );
}

function GroupSectionLayoutToggles({
  onStatusChange,
  section,
}: Omit<SectionEditorContentProps, "focusRoot">) {
  const host = useWorkspaceHost();
  const canEditLayout = useWorkspaceCapabilities(
    (state) => state.canEditLayout,
  );
  function changeOrientation(): void {
    toggleGroupOrientation(host, section.id);
    onStatusChange(
      section.isHorizontalOrientation
        ? "Group children now stack vertically."
        : "Group children now flow horizontally.",
    );
  }
  function changeOverflowMode(): void {
    const nextOverflowMode = !section.overflowMode;
    setGroupOverflowMode(host, section.id, nextOverflowMode);
    onStatusChange(
      nextOverflowMode
        ? "Bounded overflow enabled."
        : "Bounded overflow disabled.",
    );
  }
  return (
    <>
      <button
        aria-pressed={section.isHorizontalOrientation}
        className="setta-workspace-inspector-toggle"
        disabled={!canEditLayout}
        onClick={changeOrientation}
        type="button"
      >
        {section.isHorizontalOrientation ? "Horizontal" : "Vertical"}
      </button>
      <button
        aria-pressed={section.overflowMode}
        className="setta-workspace-inspector-toggle"
        disabled={!canEditLayout || section.positionAndSizeLocked}
        onClick={changeOverflowMode}
        type="button"
      >
        Bounded overflow
      </button>
    </>
  );
}

function SectionLayoutSettings({
  focusRoot,
  includeInspectorCommands,
  onStatusChange,
  section,
}: SectionEditorContentProps & { includeInspectorCommands: boolean }) {
  return (
    <>
      <div className="setta-workspace-inspector-toggle-grid">
        <SectionLockToggle onStatusChange={onStatusChange} section={section} />
        {includeInspectorCommands ? (
          <SectionMinimizeToggle
            onStatusChange={onStatusChange}
            section={section}
          />
        ) : null}
        {isGroupSection(section) ? (
          <GroupSectionLayoutToggles
            onStatusChange={onStatusChange}
            section={section}
          />
        ) : null}
      </div>
      <SectionSizeEditor
        onEscape={focusRoot}
        onStatusChange={onStatusChange}
        section={section}
      />
    </>
  );
}

function SectionSettings({
  focusRoot,
  includeInspectorCommands,
  mainPresentation,
  onStatusChange,
  section,
}: SectionEditorContentProps & {
  includeInspectorCommands: boolean;
  mainPresentation: boolean;
}) {
  const nameField = (
    <SectionNameField
      focusRoot={focusRoot}
      onStatusChange={onStatusChange}
      section={section}
    />
  );
  const layoutSettings = (
    <SectionLayoutSettings
      focusRoot={focusRoot}
      includeInspectorCommands={includeInspectorCommands}
      onStatusChange={onStatusChange}
      section={section}
    />
  );
  return (
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
  );
}

function CompactSectionStyleColorEditor({
  focusRoot,
  onStatusChange,
  section,
}: SectionEditorContentProps) {
  const host = useWorkspaceHost();
  const canEditStructure = useWorkspaceCapabilities(
    (state) => state.canEditStructure,
  );
  return (
    <CommitTextField
      disabled={!canEditStructure}
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
  );
}

function SectionAppearanceSettings({
  focusRoot,
  mainPresentation,
  onStatusChange,
  section,
  sectionTagColorPalette,
}: SectionEditorContentProps & {
  mainPresentation: boolean;
  sectionTagColorPalette: WorkspaceSectionTagColorPalette;
}) {
  return (
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
        <CompactSectionStyleColorEditor
          focusRoot={focusRoot}
          onStatusChange={onStatusChange}
          section={section}
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
  );
}

function SectionInspectorHeading({ section }: { section: WorkspaceSection }) {
  return (
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
  );
}

function SectionInspectorCommands({
  onStatusChange,
  section,
}: Omit<SectionEditorContentProps, "focusRoot">) {
  const host = useWorkspaceHost();
  const contexts = [createSectionCommandContext(host, section, [section])];
  return (
    <>
      <WorkspaceInspectorCommandActions
        contexts={contexts}
        focusKey="section-actions"
        onStatusChange={onStatusChange}
        surface="inspector"
      />
      <WorkspaceInspectorCommandActions
        contexts={contexts}
        focusKey="item-authoring-actions"
        onStatusChange={onStatusChange}
        surface="inspector-parameters"
      />
    </>
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
  const mainPresentation = !includeInspectorCommands;
  return (
    <div
      className="setta-workspace-inspector-editor"
      data-inspector-branch="section"
      data-main-presentation={mainPresentation || undefined}
    >
      {includeInspectorCommands ? (
        <SectionInspectorHeading section={section} />
      ) : null}
      <SectionSettings
        focusRoot={focusRoot}
        includeInspectorCommands={includeInspectorCommands}
        mainPresentation={mainPresentation}
        onStatusChange={onStatusChange}
        section={section}
      />
      <SectionAppearanceSettings
        focusRoot={focusRoot}
        mainPresentation={mainPresentation}
        onStatusChange={onStatusChange}
        section={section}
        sectionTagColorPalette={sectionTagColorPalette}
      />
      {includeInspectorCommands ? (
        <SectionInspectorCommands
          onStatusChange={onStatusChange}
          section={section}
        />
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
