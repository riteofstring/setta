import { useEffect, useState, type KeyboardEvent } from "react";
import type {
  WorkspaceColorChoice,
  WorkspaceDropdownChoiceGroup,
} from "../document/types";
import {
  ConfigurationActionButton,
  ConfigurationRow,
  DraftTextConfigurationRow,
  ReadOnlyConfigurationRow,
  createConfigurationUpdate,
  type ConfigurationEditorProps,
  type WorkspaceItemValueControl,
} from "./workspaceItemConfigurationFields";

type DropdownControl = Extract<WorkspaceItemValueControl, { kind: "dropdown" }>;
type ColorControl = Extract<WorkspaceItemValueControl, { kind: "color" }>;

function handleButtonEscape(
  event: KeyboardEvent<HTMLElement>,
  onEscape: () => void,
): void {
  if (event.key !== "Escape") {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  onEscape();
}

function RemoveConfigurationButton({
  disabled,
  label,
  onClick,
  onEscape,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
  onEscape: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="setta-workspace-inspector-config-remove"
      disabled={disabled}
      onClick={onClick}
      onKeyDown={(event) => handleButtonEscape(event, onEscape)}
      type="button"
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}

function createUniqueLabel(
  prefix: string,
  existing: ReadonlySet<string>,
): string {
  let index = existing.size + 1;
  while (existing.has(`${prefix} ${index}`)) {
    index += 1;
  }
  return `${prefix} ${index}`;
}

function FlatDropdownChoices({
  choices,
  control,
  disabled,
  onCommit,
  onEscape,
}: ConfigurationEditorProps<DropdownControl> & { choices: Array<string> }) {
  const commitChoices = (nextChoices: Array<string>) =>
    onCommit(
      createConfigurationUpdate(control, {
        ...control.configuration,
        choices: nextChoices,
      }),
    );
  return (
    <>
      <ConfigurationActionButton
        disabled={disabled}
        label="Add choice"
        onClick={() => {
          const nextChoice = createUniqueLabel("Choice", new Set(choices));
          commitChoices([...choices, nextChoice]);
        }}
        onEscape={onEscape}
      >
        <span>Add Choices</span>
        <span aria-hidden="true">+</span>
      </ConfigurationActionButton>
      {choices.length === 0 ? (
        <ConfigurationActionButton
          disabled={disabled}
          label="Add choice group"
          onClick={() =>
            onCommit(
              createConfigurationUpdate(control, {
                ...control.configuration,
                choices: [{ group: "Group 1", choices: [] }],
              }),
            )
          }
          onEscape={onEscape}
        >
          <span>Add Choice Group</span>
          <span aria-hidden="true">+</span>
        </ConfigurationActionButton>
      ) : null}
      <div className="setta-workspace-inspector-config-list">
        {choices.map((choice, index) => (
          <div
            className="setta-workspace-inspector-config-list-item"
            key={index}
          >
            <DraftTextConfigurationRow
              disabled={disabled}
              label={`Choice ${index + 1}`}
              name={`choice-${index}`}
              onCommit={(nextChoice) => {
                commitChoices(
                  choices.map((currentChoice, currentIndex) =>
                    currentIndex === index ? nextChoice : currentChoice,
                  ),
                );
              }}
              onEscape={onEscape}
              validate={(nextChoice) => {
                if (nextChoice.trim() === "") {
                  return "A choice must not be blank.";
                }
                return choices.some(
                  (currentChoice, currentIndex) =>
                    currentIndex !== index && currentChoice === nextChoice,
                )
                  ? `Choice ${nextChoice} is already present.`
                  : null;
              }}
              value={choice}
            />
            <RemoveConfigurationButton
              disabled={disabled}
              label={`Remove choice ${choice}`}
              onClick={() =>
                commitChoices(
                  choices.filter((_, currentIndex) => currentIndex !== index),
                )
              }
              onEscape={onEscape}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function getGroupedChoiceValues(
  groups: Array<WorkspaceDropdownChoiceGroup>,
): Set<string> {
  return new Set(groups.flatMap((group) => group.choices));
}

function GroupedDropdownChoices({
  choices,
  control,
  disabled,
  onCommit,
  onEscape,
}: ConfigurationEditorProps<DropdownControl> & {
  choices: Array<WorkspaceDropdownChoiceGroup>;
}) {
  const commitGroups = (nextChoices: Array<WorkspaceDropdownChoiceGroup>) =>
    onCommit(
      createConfigurationUpdate(control, {
        ...control.configuration,
        choices: nextChoices,
      }),
    );
  return (
    <div className="setta-workspace-inspector-config-list">
      <ConfigurationActionButton
        disabled={disabled}
        label="Add choice group"
        onClick={() => {
          const nextGroup = createUniqueLabel(
            "Group",
            new Set(choices.map((group) => group.group)),
          );
          commitGroups([...choices, { group: nextGroup, choices: [] }]);
        }}
        onEscape={onEscape}
      >
        <span>Add Choice Group</span>
        <span aria-hidden="true">+</span>
      </ConfigurationActionButton>
      {choices.map((group, groupIndex) => (
        <div
          className="setta-workspace-inspector-config-group"
          key={groupIndex}
        >
          <div className="setta-workspace-inspector-config-list-item">
            <DraftTextConfigurationRow
              disabled={disabled}
              label={`Group ${groupIndex + 1}`}
              name={`group-${groupIndex}`}
              onCommit={(nextGroup) =>
                commitGroups(
                  choices.map((currentGroup, currentIndex) =>
                    currentIndex === groupIndex
                      ? { ...currentGroup, group: nextGroup }
                      : currentGroup,
                  ),
                )
              }
              onEscape={onEscape}
              validate={(nextGroup) =>
                nextGroup.trim() === ""
                  ? "A choice group must not be blank."
                  : null
              }
              value={group.group}
            />
            <RemoveConfigurationButton
              disabled={disabled}
              label={`Remove choice group ${group.group}`}
              onClick={() =>
                commitGroups(
                  choices.filter(
                    (_, currentIndex) => currentIndex !== groupIndex,
                  ),
                )
              }
              onEscape={onEscape}
            />
          </div>
          {group.choices.map((choice, choiceIndex) => (
            <div
              className="setta-workspace-inspector-config-list-item"
              key={choiceIndex}
            >
              <DraftTextConfigurationRow
                disabled={disabled}
                label={`${group.group} choice ${choiceIndex + 1}`}
                name={`group-${groupIndex}-choice-${choiceIndex}`}
                onCommit={(nextChoice) =>
                  commitGroups(
                    choices.map((currentGroup, currentGroupIndex) =>
                      currentGroupIndex === groupIndex
                        ? {
                            ...currentGroup,
                            choices: currentGroup.choices.map(
                              (currentChoice, currentChoiceIndex) =>
                                currentChoiceIndex === choiceIndex
                                  ? nextChoice
                                  : currentChoice,
                            ),
                          }
                        : currentGroup,
                    ),
                  )
                }
                onEscape={onEscape}
                validate={(nextChoice) => {
                  if (nextChoice.trim() === "") {
                    return "A choice must not be blank.";
                  }
                  const values = getGroupedChoiceValues(choices);
                  values.delete(choice);
                  return values.has(nextChoice)
                    ? `Choice ${nextChoice} is already present.`
                    : null;
                }}
                value={choice}
              />
              <RemoveConfigurationButton
                disabled={disabled}
                label={`Remove choice ${choice}`}
                onClick={() =>
                  commitGroups(
                    choices.map((currentGroup, currentGroupIndex) =>
                      currentGroupIndex === groupIndex
                        ? {
                            ...currentGroup,
                            choices: currentGroup.choices.filter(
                              (_, currentChoiceIndex) =>
                                currentChoiceIndex !== choiceIndex,
                            ),
                          }
                        : currentGroup,
                    ),
                  )
                }
                onEscape={onEscape}
              />
            </div>
          ))}
          <ConfigurationActionButton
            disabled={disabled}
            label={`Add choice to ${group.group}`}
            onClick={() => {
              const nextChoice = createUniqueLabel(
                "Choice",
                getGroupedChoiceValues(choices),
              );
              commitGroups(
                choices.map((currentGroup, currentIndex) =>
                  currentIndex === groupIndex
                    ? {
                        ...currentGroup,
                        choices: [...currentGroup.choices, nextChoice],
                      }
                    : currentGroup,
                ),
              );
            }}
            onEscape={onEscape}
          >
            <span>Add Choice</span>
            <span aria-hidden="true">+</span>
          </ConfigurationActionButton>
        </div>
      ))}
    </div>
  );
}

export function DropdownConfigurationEditor(
  props: ConfigurationEditorProps<DropdownControl>,
) {
  const { control, disabled, onCommit, onEscape } = props;
  const { choices, placeholder } = control.configuration;
  const grouped = choices.length > 0 && typeof choices[0] !== "string";
  return (
    <>
      <DraftTextConfigurationRow
        disabled={disabled}
        label="Placeholder"
        name="dropdown-placeholder"
        onCommit={(nextPlaceholder) =>
          onCommit(
            createConfigurationUpdate(control, {
              ...control.configuration,
              placeholder: nextPlaceholder === "" ? null : nextPlaceholder,
            }),
          )
        }
        onEscape={onEscape}
        value={placeholder ?? ""}
      />
      {grouped ? (
        <GroupedDropdownChoices
          {...props}
          choices={choices as Array<WorkspaceDropdownChoiceGroup>}
        />
      ) : (
        <FlatDropdownChoices {...props} choices={choices as Array<string>} />
      )}
    </>
  );
}

export function DropdownParameterConfigurationEditor(
  props: ConfigurationEditorProps<DropdownControl>,
) {
  const { control, disabled, onCommit, onEscape } = props;
  const choices = control.configuration.choices;
  if (choices.length > 0 && typeof choices[0] !== "string") {
    return (
      <GroupedDropdownChoices
        {...props}
        choices={choices as Array<WorkspaceDropdownChoiceGroup>}
      />
    );
  }
  const flatChoices = choices as Array<string>;
  const commitChoices = (nextChoices: Array<string>) =>
    onCommit(
      createConfigurationUpdate(control, {
        ...control.configuration,
        choices: nextChoices,
      }),
    );
  return (
    <>
      <ConfigurationActionButton
        disabled={disabled}
        label="Add choice"
        onClick={() => commitChoices([...flatChoices, ""])}
        onEscape={onEscape}
      >
        <span>Add Choices</span>
        <span aria-hidden="true">+</span>
      </ConfigurationActionButton>
      <div className="setta-workspace-inspector-config-list">
        {flatChoices.map((choice, index) => (
          <div
            className="setta-workspace-parameter-config-choice-row"
            key={index}
          >
            <input
              aria-label={`Choice ${index + 1}`}
              className="setta-workspace-parameter-config-choice-text"
              disabled={disabled}
              onChange={(event) =>
                commitChoices(
                  flatChoices.map((currentChoice, currentIndex) =>
                    currentIndex === index
                      ? event.currentTarget.value
                      : currentChoice,
                  ),
                )
              }
              onKeyDown={(event) => handleButtonEscape(event, onEscape)}
              placeholder="Add description..."
              type="text"
              value={choice}
            />
            <RemoveConfigurationButton
              disabled={disabled}
              label={`Remove choice ${choice || index + 1}`}
              onClick={() =>
                commitChoices(
                  flatChoices.filter(
                    (_, currentIndex) => currentIndex !== index,
                  ),
                )
              }
              onEscape={onEscape}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function createNextColor(choices: Array<WorkspaceColorChoice>): string {
  const existing = new Set(choices.map((choice) => choice.color));
  if (!existing.has("#ff0000")) {
    return "#ff0000";
  }
  for (let index = choices.length + 1; index <= 0xff_ffff; index += 1) {
    const colorNumber = Math.imul(index, 2_654_435_761) & 0xff_ffff;
    const color = `#${colorNumber.toString(16).padStart(6, "0")}`;
    if (!existing.has(color)) {
      return color;
    }
  }
  throw new Error(
    "Inspector color configuration exhausted every six-digit color.",
  );
}

function ColorInputRow({
  choices,
  disabled,
  index,
  onChange,
  onEscape,
}: {
  choices: Array<WorkspaceColorChoice>;
  disabled: boolean;
  index: number;
  onChange: (color: string) => void;
  onEscape: () => void;
}) {
  const choice = choices[index];
  if (!choice) {
    throw new Error(`Inspector is missing color choice ${index}.`);
  }
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [choice.color]);
  return (
    <ConfigurationRow
      error={error}
      label={`Color ${index + 1}`}
      name={`color-${index}`}
    >
      {(props) => (
        <input
          {...props}
          disabled={disabled}
          onChange={(event) => {
            const color = event.currentTarget.value;
            if (
              choices.some(
                (currentChoice, currentIndex) =>
                  currentIndex !== index && currentChoice.color === color,
              )
            ) {
              setError(`Color ${color} is already present.`);
              return;
            }
            setError(null);
            onChange(color);
          }}
          onKeyDown={(event) => handleButtonEscape(event, onEscape)}
          type="color"
          value={choice.color}
        />
      )}
    </ConfigurationRow>
  );
}

export function ColorConfigurationEditor({
  control,
  disabled,
  onCommit,
  onEscape,
}: ConfigurationEditorProps<ColorControl>) {
  const choices = control.configuration.choices;
  const commitChoices = (nextChoices: Array<WorkspaceColorChoice> | null) =>
    onCommit(
      createConfigurationUpdate(control, {
        ...control.configuration,
        choices: nextChoices,
      }),
    );
  return (
    <>
      <ConfigurationActionButton
        disabled={disabled}
        label="Add color"
        onClick={() => {
          const currentChoices = choices ?? [];
          commitChoices([
            ...currentChoices,
            {
              color: createNextColor(currentChoices),
              description: `Color ${currentChoices.length + 1}`,
            },
          ]);
        }}
        onEscape={onEscape}
      >
        <span>Add Colors</span>
        <span aria-hidden="true">+</span>
      </ConfigurationActionButton>
      {choices === null ? (
        <ReadOnlyConfigurationRow label="Picker" value="Native colors" />
      ) : null}
      <div className="setta-workspace-inspector-config-list">
        {choices?.map((choice, index) => (
          <div
            className="setta-workspace-inspector-config-group"
            key={`${choice.color}-${index}`}
          >
            <div className="setta-workspace-inspector-config-list-item">
              <ColorInputRow
                choices={choices}
                disabled={disabled}
                index={index}
                onChange={(color) =>
                  commitChoices(
                    choices.map((currentChoice, currentIndex) =>
                      currentIndex === index
                        ? { ...currentChoice, color }
                        : currentChoice,
                    ),
                  )
                }
                onEscape={onEscape}
              />
              <RemoveConfigurationButton
                disabled={disabled}
                label={`Remove color ${choice.description}`}
                onClick={() => {
                  const nextChoices = choices.filter(
                    (_, currentIndex) => currentIndex !== index,
                  );
                  commitChoices(nextChoices.length === 0 ? null : nextChoices);
                }}
                onEscape={onEscape}
              />
            </div>
            <DraftTextConfigurationRow
              disabled={disabled}
              label="Description"
              name={`color-description-${index}`}
              onCommit={(description) =>
                commitChoices(
                  choices.map((currentChoice, currentIndex) =>
                    currentIndex === index
                      ? { ...currentChoice, description }
                      : currentChoice,
                  ),
                )
              }
              onEscape={onEscape}
              placeholder="Add description..."
              validate={(description) =>
                description.trim() === ""
                  ? "A color description must not be blank."
                  : null
              }
              value={choice.description}
            />
          </div>
        ))}
      </div>
    </>
  );
}

export function ColorParameterConfigurationEditor({
  control,
  disabled,
  onCommit,
  onEscape,
}: ConfigurationEditorProps<ColorControl>) {
  const choices = control.configuration.choices ?? [];
  const commitChoices = (nextChoices: Array<WorkspaceColorChoice>) =>
    onCommit(
      createConfigurationUpdate(control, {
        ...control.configuration,
        choices: nextChoices,
      }),
    );
  return (
    <>
      <ConfigurationActionButton
        disabled={disabled}
        label="Add color"
        onClick={() =>
          commitChoices([
            ...choices,
            { color: "#ff0000", description: "" },
          ])
        }
        onEscape={onEscape}
      >
        <span>Add Colors</span>
        <span aria-hidden="true">+</span>
      </ConfigurationActionButton>
      <div className="setta-workspace-inspector-config-list">
        {choices.map((choice, index) => (
          <div
            className="setta-workspace-parameter-config-choice-row"
            key={index}
          >
            <div className="setta-workspace-parameter-config-color-fields">
              <input
                aria-label={`Color ${index + 1}`}
                className="setta-workspace-parameter-config-color-input"
                disabled={disabled}
                onChange={(event) =>
                  commitChoices(
                    choices.map((currentChoice, currentIndex) =>
                      currentIndex === index
                        ? { ...currentChoice, color: event.currentTarget.value }
                        : currentChoice,
                    ),
                  )
                }
                onKeyDown={(event) => handleButtonEscape(event, onEscape)}
                type="color"
                value={choice.color}
              />
              <input
                aria-label={`Color ${index + 1} description`}
                className="setta-workspace-parameter-config-choice-text"
                disabled={disabled}
                onChange={(event) =>
                  commitChoices(
                    choices.map((currentChoice, currentIndex) =>
                      currentIndex === index
                        ? {
                            ...currentChoice,
                            description: event.currentTarget.value,
                          }
                        : currentChoice,
                    ),
                  )
                }
                onKeyDown={(event) => handleButtonEscape(event, onEscape)}
                placeholder="Add description..."
                type="text"
                value={choice.description}
              />
            </div>
            <RemoveConfigurationButton
              disabled={disabled}
              label={`Remove color ${choice.description || choice.color}`}
              onClick={() =>
                commitChoices(
                  choices.filter(
                    (_, currentIndex) => currentIndex !== index,
                  ),
                )
              }
              onEscape={onEscape}
            />
          </div>
        ))}
      </div>
    </>
  );
}
