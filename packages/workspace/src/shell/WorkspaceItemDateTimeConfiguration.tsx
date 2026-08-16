import type { KeyboardEvent } from "react";
import {
  BooleanConfigurationRow,
  ConfigurationRow,
  ReadOnlyConfigurationRow,
  SelectConfigurationRow,
  createConfigurationUpdate,
  type ConfigurationEditorProps,
  type ConfigurationOption,
  type WorkspaceItemValueControl,
} from "./workspaceItemConfigurationFields";

type DateControl = Extract<WorkspaceItemValueControl, { kind: "date" }>;
type TimeControl = Extract<WorkspaceItemValueControl, { kind: "time" }>;

const DATE_DISPLAY_OPTIONS: ReadonlyArray<ConfigurationOption> = [
  { label: "ISO (YYYY-MM-DD)", value: "iso" },
  { label: "US (MM/DD/YYYY)", value: "us" },
  { label: "EU (DD/MM/YYYY)", value: "eu" },
  { label: "Long (Month D, YYYY)", value: "long" },
];
const DATE_CONTROL_OPTIONS: ReadonlyArray<ConfigurationOption> = [
  { label: "Date input", value: "input" },
  { label: "Calendar", value: "calendar" },
];
const DATE_SELECTION_OPTIONS: ReadonlyArray<ConfigurationOption> = [
  { label: "Single date", value: "single" },
  { label: "Multiple dates", value: "multiple" },
];
const WEEK_START_OPTIONS: ReadonlyArray<ConfigurationOption> = [
  { label: "Sunday", value: "sunday" },
  { label: "Monday", value: "monday" },
];
const TIME_CONTROL_OPTIONS: ReadonlyArray<ConfigurationOption> = [
  { label: "Display", value: "display" },
  { label: "Input", value: "input" },
];
const TIME_FORMAT_OPTIONS: ReadonlyArray<ConfigurationOption> = [
  { label: "24-hour", value: "twenty_four_hour" },
  { label: "12-hour", value: "twelve_hour" },
];
const TIME_FONT_OPTIONS: ReadonlyArray<ConfigurationOption> = [
  { label: "Clock", value: "clock" },
  { label: "Monospace", value: "monospace" },
  { label: "System", value: "system" },
];

function handleEscape(
  event: KeyboardEvent<HTMLInputElement>,
  onEscape: () => void,
): void {
  if (event.key !== "Escape") {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  onEscape();
}

export function DateConfigurationEditor({
  control,
  disabled,
  onCommit,
  onEscape,
}: ConfigurationEditorProps<DateControl>) {
  const configuration = control.configuration;
  const commit = (nextConfiguration: DateControl["configuration"]) =>
    onCommit(createConfigurationUpdate(control, nextConfiguration));
  return (
    <>
      <SelectConfigurationRow
        disabled={disabled}
        label="Date Display"
        name="date-display-format"
        onChange={(displayFormat) =>
          commit({
            ...configuration,
            displayFormat:
              displayFormat as DateControl["configuration"]["displayFormat"],
          })
        }
        onEscape={onEscape}
        options={DATE_DISPLAY_OPTIONS}
        value={configuration.displayFormat}
      />
      <SelectConfigurationRow
        disabled={disabled}
        label="Date UI"
        name="date-control-mode"
        onChange={(controlMode) =>
          commit({
            ...configuration,
            controlMode:
              controlMode as DateControl["configuration"]["controlMode"],
          })
        }
        onEscape={onEscape}
        options={DATE_CONTROL_OPTIONS}
        value={configuration.controlMode}
      />
      <BooleanConfigurationRow
        checked={configuration.includeTime}
        disabled={disabled}
        label="Include Time"
        onChange={(includeTime) =>
          commit({
            ...configuration,
            includeTime,
            selectionMode: includeTime ? "single" : configuration.selectionMode,
          })
        }
        onEscape={onEscape}
      />
      {configuration.includeTime ? (
        <SelectConfigurationRow
          disabled={disabled}
          label="Time Format"
          name="date-time-format"
          onChange={(timeDisplayFormat) =>
            commit({
              ...configuration,
              timeDisplayFormat:
                timeDisplayFormat as DateControl["configuration"]["timeDisplayFormat"],
            })
          }
          onEscape={onEscape}
          options={TIME_FORMAT_OPTIONS}
          value={configuration.timeDisplayFormat}
        />
      ) : null}
      {configuration.controlMode === "calendar" ? (
        <>
          {configuration.includeTime ? (
            <ReadOnlyConfigurationRow label="Selection" value="Single date" />
          ) : (
            <SelectConfigurationRow
              disabled={disabled}
              label="Selection"
              name="date-selection-mode"
              onChange={(selectionMode) =>
                commit({
                  ...configuration,
                  selectionMode:
                    selectionMode as DateControl["configuration"]["selectionMode"],
                })
              }
              onEscape={onEscape}
              options={DATE_SELECTION_OPTIONS}
              value={configuration.selectionMode}
            />
          )}
          <SelectConfigurationRow
            disabled={disabled}
            label="Week Starts"
            name="date-week-start"
            onChange={(weekStart) =>
              commit({
                ...configuration,
                weekStart:
                  weekStart as DateControl["configuration"]["weekStart"],
              })
            }
            onEscape={onEscape}
            options={WEEK_START_OPTIONS}
            value={configuration.weekStart}
          />
        </>
      ) : null}
    </>
  );
}

export function TimeConfigurationEditor({
  control,
  disabled,
  onCommit,
  onEscape,
}: ConfigurationEditorProps<TimeControl>) {
  const configuration = control.configuration;
  const commit = (nextConfiguration: TimeControl["configuration"]) =>
    onCommit(createConfigurationUpdate(control, nextConfiguration));
  return (
    <>
      <SelectConfigurationRow
        disabled={disabled}
        label="Time UI"
        name="time-control-mode"
        onChange={(controlMode) =>
          commit({
            ...configuration,
            controlMode:
              controlMode as TimeControl["configuration"]["controlMode"],
          })
        }
        onEscape={onEscape}
        options={TIME_CONTROL_OPTIONS}
        value={configuration.controlMode}
      />
      <SelectConfigurationRow
        disabled={disabled}
        label="Time Format"
        name="time-display-format"
        onChange={(displayFormat) =>
          commit({
            ...configuration,
            displayFormat:
              displayFormat as TimeControl["configuration"]["displayFormat"],
          })
        }
        onEscape={onEscape}
        options={TIME_FORMAT_OPTIONS}
        value={configuration.displayFormat}
      />
      {configuration.controlMode === "display" ? (
        <>
          <BooleanConfigurationRow
            checked={configuration.transparent}
            disabled={disabled}
            label="Transparent"
            onChange={(transparent) =>
              commit({ ...configuration, transparent })
            }
            onEscape={onEscape}
          />
          <ConfigurationRow label="Clock Scale" name="time-scale">
            {(props) => (
              <div className="setta-workspace-inspector-config-range">
                <input
                  {...props}
                  disabled={disabled}
                  max="3"
                  min="0.5"
                  onChange={(event) =>
                    commit({
                      ...configuration,
                      scale: Number(event.currentTarget.value),
                    })
                  }
                  onKeyDown={(event) => handleEscape(event, onEscape)}
                  step="0.1"
                  type="range"
                  value={configuration.scale}
                />
                <span>{configuration.scale.toFixed(1)}x</span>
              </div>
            )}
          </ConfigurationRow>
          <SelectConfigurationRow
            disabled={disabled}
            label="Clock Font"
            name="time-font"
            onChange={(font) =>
              commit({
                ...configuration,
                font: font as TimeControl["configuration"]["font"],
              })
            }
            onEscape={onEscape}
            options={TIME_FONT_OPTIONS}
            value={configuration.font}
          />
        </>
      ) : null}
    </>
  );
}
