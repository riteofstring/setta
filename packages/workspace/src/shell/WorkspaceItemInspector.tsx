import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ItemNameEditor } from "../controls/name/ItemNameEditor";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { hasWorkspaceItemPresentation } from "../document/itemPresentation";
import {
  setItemHelpText,
  setItemLabel,
  setItemPresentation,
} from "../document/itemPresentationMutations";
import { ItemSelectionModeAffectsControlsContext } from "../document/itemSelectionMode";
import {
  createWorkspaceInspectorContributionContext,
  getRegisteredSectionKindOrThrow,
} from "../document/sectionKindRegistry";
import type { WorkspaceItem, WorkspaceSection } from "../document/types";
import { getItemHandlerRegistration } from "../items/itemHandlerRegistry";
import { WorkspaceInspectorItemActions } from "./WorkspaceInspectorItemActions";
import { WorkspaceItemConfigurationEditor } from "./WorkspaceItemConfigurationEditor";
import {
  createWorkspaceInspectorItemControl,
  isWorkspaceInspectorItemControlKind,
  WORKSPACE_INSPECTOR_ITEM_CONTROL_KINDS,
  type WorkspaceInspectorItemControlKind,
} from "./workspaceInspectorItemDefaults";

type WorkspaceItemInspectorProps = {
  section: WorkspaceSection;
  item: WorkspaceItem;
  onEscape: () => void;
  onStatusChange: (message: string) => void;
};

const CONTROL_LABELS: Record<WorkspaceInspectorItemControlKind, string> = {
  text: "Text",
  code: "Code",
  textarea: "Text area",
  switch: "Switch",
  dropdown: "Dropdown",
  color: "Color",
  slider: "Slider",
  rotary: "Rotary",
  password: "Password",
  date: "Date",
  time: "Time",
  dropzone: "Dropzone",
};

function UnsupportedCustomItem({
  item,
  section,
}: {
  item: WorkspaceItem;
  section: WorkspaceSection;
}) {
  const contribution = getRegisteredSectionKindOrThrow(section.kind).renderInspector;
  if (contribution) {
    return (
      <div
        className="setta-workspace-inspector-contribution"
        data-inspector-focus-key="custom-item"
      >
        {contribution(createWorkspaceInspectorContributionContext({ type: "item", section, item }))}
      </div>
    );
  }
  return (
    <div className="setta-workspace-inspector-unsupported" role="note">
      <h3>Custom item</h3>
      <p>This item uses host-owned content. Its section kind has no Inspector contribution.</p>
    </div>
  );
}

function isControlKindAvailable(
  sectionId: string,
  itemId: string,
  kind: WorkspaceInspectorItemControlKind,
): boolean {
  const registration = getItemHandlerRegistration(sectionId, itemId);
  if (kind === "dropzone") {
    return registration?.kind === "dropzone";
  }
  if (kind === "password") {
    return registration === null || registration.kind === "password";
  }
  return true;
}

function ItemTypeField({
  currentKind,
  disabled,
  itemId,
  onChange,
  onEscape,
  sectionId,
}: {
  currentKind: WorkspaceInspectorItemControlKind;
  disabled: boolean;
  itemId: string;
  onChange: (kind: WorkspaceInspectorItemControlKind) => void;
  onEscape: () => void;
  sectionId: string;
}) {
  return (
    <div className="setta-workspace-inspector-field" data-inspector-focus-key="item-type">
      <label className="setta-workspace-inspector-label" htmlFor="setta-inspector-item-type">
        UI type
      </label>
      <select
        className="setta-workspace-inspector-input"
        disabled={disabled}
        id="setta-inspector-item-type"
        onChange={(event) => {
          if (!isWorkspaceInspectorItemControlKind(event.currentTarget.value)) {
            throw new Error(
              `Inspector selected unknown item control ${event.currentTarget.value}.`,
            );
          }
          onChange(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          onEscape();
        }}
        value={currentKind}
      >
        {WORKSPACE_INSPECTOR_ITEM_CONTROL_KINDS.map((kind) => (
          <option
            disabled={!isControlKindAvailable(sectionId, itemId, kind)}
            key={kind}
            value={kind}
          >
            {CONTROL_LABELS[kind]}
          </option>
        ))}
      </select>
      {!isControlKindAvailable(sectionId, itemId, "dropzone") ? (
        <p className="setta-workspace-inspector-help">
          Dropzone requires host handlers registered for this item.
        </p>
      ) : null}
    </div>
  );
}

function ItemHelpTextField({
  disabled,
  itemId,
  itemLabel,
  onEscape,
  onStatusChange,
  sectionId,
  value,
}: {
  disabled: boolean;
  itemId: string;
  itemLabel: string;
  onEscape: () => void;
  onStatusChange: (message: string) => void;
  sectionId: string;
  value: string | undefined;
}) {
  const reactId = useId().replaceAll(":", "");
  const inputId = `setta-inspector-item-help-${reactId}`;
  const hintId = `${inputId}-hint`;
  const canonicalValue = value ?? "";
  const [draft, setDraft] = useState(canonicalValue);
  const skipBlurRef = useRef(false);

  useEffect(() => {
    setDraft(canonicalValue);
  }, [canonicalValue]);

  function commit(): void {
    if (draft === canonicalValue) {
      return;
    }
    const nextHelpText = draft.length === 0 ? null : draft;
    setItemHelpText(sectionId, itemId, nextHelpText);
    const resolvedLabel = itemLabel.trim() || itemId;
    onStatusChange(
      nextHelpText === null
        ? `Help text cleared for ${resolvedLabel}.`
        : `Help text updated for ${resolvedLabel}.`,
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      commit();
      return;
    }
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    skipBlurRef.current = true;
    setDraft(canonicalValue);
    onEscape();
  }

  return (
    <div className="setta-workspace-inspector-field" data-inspector-focus-key="item-help-text">
      <label className="setta-workspace-inspector-label" htmlFor={inputId}>
        Help text
      </label>
      <textarea
        aria-describedby={hintId}
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
        rows={3}
        style={{ minHeight: 60 }}
        value={draft}
      />
      <p className="setta-workspace-inspector-help" id={hintId}>
        Shown from the parameter row. Leave blank to hide the help button.
      </p>
    </div>
  );
}

function TypedItemInspector({
  item,
  onEscape,
  onStatusChange,
  section,
}: WorkspaceItemInspectorProps & {
  item: WorkspaceItem & { presentation: NonNullable<WorkspaceItem["presentation"]> };
}) {
  const canEditStructure = useWorkspaceCapabilities((state) => state.canEditStructure);
  const { control, helpText, label } = item.presentation;

  function changeControlKind(kind: WorkspaceInspectorItemControlKind): void {
    if (control.kind === kind) {
      return;
    }
    if (!isControlKindAvailable(section.id, item.id, kind)) {
      throw new Error(`Item ${section.id}/${item.id} cannot use unavailable ${kind} handlers.`);
    }
    const previousValue = control.kind === "group" ? "" : control.value;
    setItemPresentation(
      section.id,
      item.id,
      createWorkspaceInspectorItemControl(kind, previousValue),
    );
    onStatusChange(`${label || item.id} now uses ${CONTROL_LABELS[kind]}.`);
  }

  return (
    <div className="setta-workspace-inspector-editor" data-inspector-branch="item">
      <div className="setta-workspace-inspector-section-heading">
        <h3>{label || item.id}</h3>
        <span>Item</span>
      </div>
      <div className="setta-workspace-inspector-field" data-inspector-focus-key="item-label">
        <span className="setta-workspace-inspector-label">Label</span>
        <div className="setta-workspace-inspector-item-name">
          <ItemNameEditor
            disabled={!canEditStructure}
            hasChildren={item.children.length > 0}
            itemId={item.id}
            name={label}
            onNameChange={(nextLabel) => {
              setItemLabel(section.id, item.id, nextLabel);
              onStatusChange(`Item label changed to ${nextLabel || "blank"}.`);
            }}
            onEscape={onEscape}
            sectionId={section.id}
          />
        </div>
      </div>
      <ItemHelpTextField
        disabled={!canEditStructure}
        itemId={item.id}
        itemLabel={label}
        onEscape={onEscape}
        onStatusChange={onStatusChange}
        sectionId={section.id}
        value={helpText}
      />
      {control.kind === "group" ? (
        <div className="setta-workspace-inspector-readonly-row">
          <span>UI type</span>
          <span className="setta-workspace-inspector-readonly-value">Group</span>
        </div>
      ) : (
        <>
          <ItemTypeField
            currentKind={control.kind}
            disabled={!canEditStructure}
            itemId={item.id}
            onChange={changeControlKind}
            onEscape={onEscape}
            sectionId={section.id}
          />
          <div data-inspector-focus-key="item-configuration">
            <WorkspaceItemConfigurationEditor
              control={control}
              disabled={!canEditStructure}
              itemId={item.id}
              onEscape={onEscape}
              onStatusChange={onStatusChange}
              sectionId={section.id}
            />
          </div>
        </>
      )}
    </div>
  );
}

export function WorkspaceItemInspector(props: WorkspaceItemInspectorProps) {
  return (
    <>
      {hasWorkspaceItemPresentation(props.item) ? (
        <ItemSelectionModeAffectsControlsContext.Provider value={false}>
          <TypedItemInspector {...props} item={props.item} />
        </ItemSelectionModeAffectsControlsContext.Provider>
      ) : (
        <UnsupportedCustomItem item={props.item} section={props.section} />
      )}
      <WorkspaceInspectorItemActions
        deleteMode="item"
        itemId={props.item.id}
        onStatusChange={props.onStatusChange}
        section={props.section}
      />
    </>
  );
}
