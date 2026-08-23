import { useId, useMemo, useState } from "react";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { ParameterConfigurationTypeCombobox } from "../controls/dropdown/DropdownValueControl";
import { setItemPresentation } from "../document/itemPresentationMutations";
import { useWorkspaceDocumentSnapshot } from "../document/useWorkspaceDocumentSnapshot";
import type {
  WorkspaceItem,
  WorkspaceItemControlPresentation,
  WorkspaceSectionItemTree,
} from "../document/types";
import { getItemHandlerRegistration } from "../items/itemHandlerRegistry";
import { useWorkspaceHost } from "../workspaceHostContext";
import { WorkspaceItemConfigurationEditor } from "./WorkspaceItemConfigurationEditor";
import {
  createWorkspaceInspectorItemControl,
  isWorkspaceInspectorItemControlKind,
  type WorkspaceInspectorItemControlKind,
} from "./workspaceInspectorItemDefaults";

type WorkspaceParameterConfigurationViewProps = {
  sectionId: string;
};

const MAIN_UI_TYPE_LABELS: Record<WorkspaceInspectorItemControlKind, string> = {
  code: "CodeParam",
  text: "TextParam",
  date: "DateParam",
  time: "TimeParam",
  slider: "SliderParam",
  rotary: "RotaryParam",
  switch: "SwitchParam",
  color: "ColorPickerParam",
  dropdown: "DropdownParam",
  password: "PasswordParam",
  textarea: "TextAreaParam",
  dropzone: "DropzoneParam",
};

const MAIN_SECTION_PARAMETER_CONTROL_KINDS = [
  "code",
  "text",
  "date",
  "time",
  "slider",
  "rotary",
  "switch",
  "color",
  "dropdown",
  "password",
  "textarea",
  "dropzone",
] as const satisfies ReadonlyArray<WorkspaceInspectorItemControlKind>;

export function WorkspaceParameterConfigurationView({
  sectionId,
}: WorkspaceParameterConfigurationViewProps) {
  const document = useWorkspaceDocumentSnapshot();
  const section = document.sections[sectionId];
  const itemTree = section?.itemTree;
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const rows = useMemo(
    () =>
      itemTree === undefined
        ? []
        : collectPresentedItems(itemTree).filter(({ item }) =>
            item.presentation?.label
              .toLocaleLowerCase()
              .includes(filter.trim().toLocaleLowerCase()),
          ),
    [filter, itemTree],
  );

  if (section === undefined || itemTree === undefined) {
    return null;
  }

  return (
    <div
      className="setta-workspace-parameter-config"
      data-workspace-parameter-config={sectionId}
    >
      <label className="setta-workspace-parameter-config-filter">
        <i aria-hidden="true" className="gg-sort-az" />
        <input
          aria-label="Filter parameters"
          onChange={(event) => setFilter(event.currentTarget.value)}
          placeholder="Filter"
          type="search"
          value={filter}
        />
      </label>
      <div className="setta-pane-scroll setta-workspace-parameter-config-list">
        {rows.map(({ item }) => (
          <ParameterConfigurationElement
            item={item}
            key={item.id}
            onStatusChange={setStatus}
            sectionId={sectionId}
          />
        ))}
      </div>
      <p aria-live="polite" className="setta-workspace-visually-hidden">
        {status}
      </p>
    </div>
  );
}

function ParameterConfigurationElement({
  item,
  onStatusChange,
  sectionId,
}: {
  item: WorkspaceItem & {
    presentation: NonNullable<WorkspaceItem["presentation"]>;
  };
  onStatusChange: (message: string) => void;
  sectionId: string;
}) {
  const host = useWorkspaceHost();
  const canEditStructure = useWorkspaceCapabilities(
    (state) => state.canEditStructure,
  );
  const inputId = `${useId()}-ui-type`;
  const control = item.presentation.control;
  const typeChoices = useMemo(
    () =>
      MAIN_SECTION_PARAMETER_CONTROL_KINDS.map((kind) => ({
        disabled: !isControlKindAvailable(host, sectionId, item.id, kind),
        id: kind,
        name: MAIN_UI_TYPE_LABELS[kind],
      })),
    [host, item.id, sectionId],
  );

  function changeControlKind(kind: WorkspaceInspectorItemControlKind): void {
    if (control.kind === kind) {
      return;
    }
    const previousValue = control.kind === "group" ? "" : control.value;
    const nextControl = createWorkspaceInspectorItemControl(
      kind,
      previousValue,
    );
    if (nextControl.kind === "code") {
      nextControl.configuration.singleLine = true;
    }
    if (nextControl.kind === "color") {
      nextControl.configuration.choices = [];
    }
    if (nextControl.kind === "time") {
      nextControl.configuration.controlMode = "display";
      nextControl.configuration.font = "monospace";
    }
    setItemPresentation(host, sectionId, item.id, nextControl);
    onStatusChange(
      `${item.presentation.label || "Parameter"} now uses ${MAIN_UI_TYPE_LABELS[kind]}.`,
    );
  }

  return (
    <section className="setta-workspace-parameter-config-element">
      <div className="setta-workspace-parameter-config-title-row">
        <h3>{item.presentation.label || "Unnamed parameter"}</h3>
      </div>
      {control.kind === "group" ? (
        <div className="setta-workspace-parameter-config-nested" role="group">
          <span>NestedParam</span>
        </div>
      ) : (
        <>
          <label className="setta-workspace-visually-hidden" htmlFor={inputId}>
            {item.presentation.label || "Unnamed parameter"} UI type
          </label>
          <ParameterConfigurationTypeCombobox
            ariaLabel={`${item.presentation.label || "Unnamed parameter"} UI type`}
            choices={typeChoices}
            disabled={!canEditStructure}
            inputId={inputId}
            onValueChange={(value) => {
              if (!isWorkspaceInspectorItemControlKind(value)) {
                throw new Error("Selected parameter UI type is unsupported.");
              }
              changeControlKind(value);
            }}
            value={control.kind}
          />
          <WorkspaceItemConfigurationEditor
            control={control}
            disabled={!canEditStructure}
            itemId={item.id}
            onEscape={() => {
              document.getElementById(inputId)?.focus();
            }}
            onStatusChange={onStatusChange}
            sectionId={sectionId}
            surface="parameter-config"
          />
        </>
      )}
    </section>
  );
}

function collectPresentedItems(itemTree: WorkspaceSectionItemTree): Array<{
  item: WorkspaceItem & {
    presentation: NonNullable<WorkspaceItem["presentation"]>;
  };
}> {
  const result: Array<{
    item: WorkspaceItem & {
      presentation: NonNullable<WorkspaceItem["presentation"]>;
    };
  }> = [];
  const visit = (parentId: string): void => {
    const parent = itemTree.items[parentId];
    if (parent === undefined) {
      throw new Error(`Workspace parameter parent ${parentId} is missing.`);
    }
    for (const childId of parent.children) {
      const child = itemTree.items[childId];
      if (child === undefined) {
        throw new Error(`Workspace parameter item ${childId} is missing.`);
      }
      if (child.presentation !== undefined) {
        result.push({
          item: {
            ...child,
            presentation: child.presentation,
          },
        });
      }
      visit(childId);
    }
  };
  visit(itemTree.rootId);
  return result;
}

function isControlKindAvailable(
  host: ReturnType<typeof useWorkspaceHost>,
  sectionId: string,
  itemId: string,
  kind: WorkspaceInspectorItemControlKind,
): boolean {
  const registration = getItemHandlerRegistration(host, sectionId, itemId);
  if (kind === "dropzone") {
    return registration?.kind === "dropzone";
  }
  if (kind === "password") {
    return registration === null || registration.kind === "password";
  }
  return true;
}
