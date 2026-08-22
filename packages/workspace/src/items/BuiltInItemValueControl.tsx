import { ColorValueControl } from "../controls/color/ColorValueControl";
import {
  DateValueControl,
  TimeValueControl,
} from "../controls/date-time/DateTimeValueControl";
import { DropdownValueControl } from "../controls/dropdown/DropdownValueControl";
import { DropzoneValueControl } from "../controls/dropzone/DropzoneValueControl";
import { PasswordValueControl } from "../controls/password/PasswordValueControl";
import { RotaryValueControl } from "../controls/rotary/RotaryValueControl";
import { SliderValueControl } from "../controls/slider/SliderValueControl";
import { SwitchValueControl } from "../controls/switch/SwitchValueControl";
import { TextValueEditor } from "../controls/text/TextValueEditor";
import { setItemValue } from "../document/itemPresentationMutations";
import type { WorkspaceItemControlPresentation } from "../document/types";
import { getItemHandlerRegistration } from "./itemHandlerRegistry";
import { useWorkspaceHost } from "../workspaceHostContext";
import type { WorkspaceHost } from "../workspaceHost";

type ValueControl = Exclude<
  WorkspaceItemControlPresentation,
  { kind: "group" }
>;

type BuiltInItemValueControlProps = {
  sectionId: string;
  itemId: string;
  label: string;
  control: ValueControl;
};

type ControlRendererProps = BuiltInItemValueControlProps & {
  host: WorkspaceHost;
  ariaLabel: string;
  onValueChange: (nextValue: string) => void;
};

function renderTextControl(props: ControlRendererProps) {
  const { configuration, kind } = props.control;
  if (kind === "text") {
    return (
      <TextValueEditor
        ariaLabel={props.ariaLabel}
        sectionId={props.sectionId}
        itemId={props.itemId}
        value={props.control.value}
        language={null}
        placeholder={configuration.placeholder ?? undefined}
        singleLine={configuration.singleLine}
        wrapLines={configuration.wrapLines}
        disabled={configuration.disabled}
        onValueChange={props.onValueChange}
      />
    );
  }
  if (kind === "code") {
    return (
      <TextValueEditor
        ariaLabel={props.ariaLabel}
        sectionId={props.sectionId}
        itemId={props.itemId}
        value={props.control.value}
        language={configuration.language}
        placeholder={configuration.placeholder ?? undefined}
        singleLine={configuration.singleLine}
        wrapLines={configuration.wrapLines}
        disabled={configuration.disabled}
        onValueChange={props.onValueChange}
      />
    );
  }
  if (kind === "textarea") {
    return (
      <TextValueEditor
        ariaLabel={props.ariaLabel}
        sectionId={props.sectionId}
        itemId={props.itemId}
        value={props.control.value}
        language={configuration.language}
        placeholder={configuration.placeholder ?? undefined}
        singleLine={false}
        wrapLines
        disabled={configuration.disabled}
        onValueChange={props.onValueChange}
      />
    );
  }
  return null;
}

function renderChoiceControl(props: ControlRendererProps) {
  const { configuration, kind } = props.control;
  if (kind === "switch") {
    return (
      <SwitchValueControl
        ariaLabel={props.ariaLabel}
        sectionId={props.sectionId}
        value={props.control.value}
        disabled={configuration.disabled}
        onValueChange={props.onValueChange}
      />
    );
  }
  if (kind === "dropdown") {
    return (
      <DropdownValueControl
        ariaLabel={props.ariaLabel}
        value={props.control.value}
        choices={configuration.choices}
        placeholder={configuration.placeholder ?? undefined}
        disabled={configuration.disabled}
        onValueChange={props.onValueChange}
      />
    );
  }
  if (kind === "color") {
    return (
      <ColorValueControl
        ariaLabel={props.ariaLabel}
        sectionId={props.sectionId}
        itemId={props.itemId}
        value={props.control.value}
        choices={configuration.choices ?? undefined}
        disabled={configuration.disabled}
        onValueChange={props.onValueChange}
      />
    );
  }
  return null;
}

function renderNumericControl(props: ControlRendererProps) {
  const { configuration, kind } = props.control;
  if (kind !== "slider" && kind !== "rotary") {
    return null;
  }
  const shared = {
    ariaLabel: props.ariaLabel,
    sectionId: props.sectionId,
    value: props.control.value,
    min: configuration.min,
    max: configuration.max,
    step: configuration.step,
    disabled: configuration.disabled,
    onValueChange: props.onValueChange,
  };
  if (kind === "slider") {
    return <SliderValueControl {...shared} />;
  }
  if (kind === "rotary") {
    return <RotaryValueControl {...shared} />;
  }
  return null;
}

function renderDateTimeControl(props: ControlRendererProps) {
  const { configuration, kind } = props.control;
  if (kind === "date") {
    return (
      <DateValueControl
        ariaLabel={props.ariaLabel}
        sectionId={props.sectionId}
        value={props.control.value}
        displayFormat={configuration.displayFormat}
        controlMode={configuration.controlMode}
        selectionMode={configuration.selectionMode}
        weekStart={configuration.weekStart}
        includeTime={configuration.includeTime}
        timeDisplayFormat={configuration.timeDisplayFormat}
        disabled={configuration.disabled}
        onValueChange={props.onValueChange}
      />
    );
  }
  if (kind === "time") {
    return (
      <TimeValueControl
        ariaLabel={props.ariaLabel}
        sectionId={props.sectionId}
        value={props.control.value}
        controlMode={configuration.controlMode}
        displayFormat={configuration.displayFormat}
        transparent={configuration.transparent}
        scale={configuration.scale}
        font={configuration.font}
        disabled={configuration.disabled}
        onValueChange={props.onValueChange}
      />
    );
  }
  return null;
}

function renderPasswordControl(props: ControlRendererProps) {
  if (props.control.kind !== "password") {
    return null;
  }
  const registration = getItemHandlerRegistration(
    props.host,
    props.sectionId,
    props.itemId,
  );
  if (registration !== null && registration.kind !== "password") {
    throw new Error(
      `Item handler ${props.sectionId}/${props.itemId} is ${registration.kind}, not password.`,
    );
  }
  const savedValueAction = registration
    ? {
        pending: props.control.configuration.savedValuePending,
        onReveal: registration.onRevealSavedValue,
      }
    : undefined;
  return (
    <PasswordValueControl
      ariaLabel={props.ariaLabel}
      sectionId={props.sectionId}
      itemId={props.itemId}
      value={props.control.value}
      placeholder={props.control.configuration.placeholder ?? undefined}
      savedValueAction={savedValueAction}
      disabled={props.control.configuration.disabled}
      onValueChange={props.onValueChange}
    />
  );
}

function renderDropzoneControl(props: ControlRendererProps) {
  if (props.control.kind !== "dropzone") {
    return null;
  }
  const registration = getItemHandlerRegistration(
    props.host,
    props.sectionId,
    props.itemId,
  );
  if (!registration || registration.kind !== "dropzone") {
    throw new Error(
      `Built-in dropzone item ${props.sectionId}/${props.itemId} requires registered dropzone handlers.`,
    );
  }
  const config = props.control.configuration;
  return (
    <DropzoneValueControl
      ariaLabel={`${props.label} dropzone`}
      sectionId={props.sectionId}
      controlId={props.itemId}
      attachments={config.attachments}
      policy={config.policy}
      placeholder={config.placeholder}
      pending={config.pending}
      errorMessage={config.errorMessage ?? undefined}
      disabled={config.disabled}
      onAccepted={registration.onAccepted}
      onRejected={registration.onRejected}
      onServerFilePickerRequest={registration.onServerFilePickerRequest}
      onAttachmentRemove={registration.onAttachmentRemove}
    />
  );
}

export function BuiltInItemValueControl(props: BuiltInItemValueControlProps) {
  const host = useWorkspaceHost();
  const rendererProps = {
    ...props,
    host,
    ariaLabel: `${props.label} value`,
    onValueChange: (nextValue: string) =>
      setItemValue(host, props.sectionId, props.itemId, nextValue),
  };
  const control =
    renderTextControl(rendererProps) ??
    renderChoiceControl(rendererProps) ??
    renderNumericControl(rendererProps) ??
    renderDateTimeControl(rendererProps) ??
    renderPasswordControl(rendererProps) ??
    renderDropzoneControl(rendererProps);
  if (!control) {
    throw new Error(
      `Built-in item ${props.sectionId}/${props.itemId} has no renderer for ${props.control.kind}.`,
    );
  }
  return control;
}
