import type { ReactNode } from "react";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "../../interaction";
import { ColorValueControl } from "../color/ColorValueControl";
import {
  MetaDateValueControl,
  MetaTimeValueControl,
} from "../date-time/DateTimeValueControl";
import { MetaDropdownValueControl } from "../dropdown/DropdownValueControl";
import { DropzoneValueControl } from "../dropzone/DropzoneValueControl";
import { MetaPasswordValueControl } from "../password/PasswordValueControl";
import { RotaryValueControl } from "../rotary/RotaryValueControl";
import { MetaSliderValueControl } from "../slider/SliderValueControl";
import { MetaSwitchValueControl } from "../switch/SwitchValueControl";
import type {
  ColorMetaControl,
  DateMetaControl,
  DropdownMetaControl,
  DropzoneMetaControl,
  PasswordMetaControl,
  RotaryMetaControl,
  SliderMetaControl,
  SwitchMetaControl,
  TimeMetaControl,
} from "./metaControlDefinitions";
import { MetaControlTitleStack } from "./MetaControlTitleStack";

type DirectMetaValueControl =
  | ColorMetaControl
  | DateMetaControl
  | DropdownMetaControl
  | DropzoneMetaControl
  | PasswordMetaControl
  | RotaryMetaControl
  | SliderMetaControl
  | SwitchMetaControl
  | TimeMetaControl;

type MetaValueControlProps = {
  sectionId: string;
  sectionName: string;
  showSectionTitle: boolean;
  control: DirectMetaValueControl;
};

export function MetaValueControl(props: MetaValueControlProps) {
  return (
    renderNumericMetaControl(props) ??
    renderChoiceMetaControl(props) ??
    renderDateTimeMetaControl(props) ??
    renderSecureOrDropMetaControl(props) ??
    failUnknownMetaControl(props.control)
  );
}

function renderNumericMetaControl(
  props: MetaValueControlProps,
): ReactNode | null {
  const { control } = props;
  if (control.kind === "slider") {
    return (
      <MetaControlTitleStack
        {...getTitleProps(props)}
        contentClassName="items-center"
      >
        <MetaSliderValueControl
          ariaLabel={control.ariaLabel}
          sectionId={props.sectionId}
          value={control.value}
          onValueChange={control.onValueChange}
          onValueCommit={control.onValueCommit}
          min={control.min}
          max={control.max}
          step={control.step}
          disabled={control.disabled}
        />
      </MetaControlTitleStack>
    );
  }
  if (control.kind === "rotary") {
    return (
      <MetaControlTitleStack
        {...getTitleProps(props)}
        contentClassName="items-center"
      >
        <div
          className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} flex w-full items-center justify-center`}
        >
          <RotaryValueControl
            ariaLabel={control.ariaLabel}
            sectionId={props.sectionId}
            value={control.value}
            onValueChange={control.onValueChange}
            min={control.min}
            max={control.max}
            step={control.step}
            disabled={control.disabled}
          />
        </div>
      </MetaControlTitleStack>
    );
  }
  return null;
}

function renderChoiceMetaControl(
  props: MetaValueControlProps,
): ReactNode | null {
  const { control } = props;
  if (control.kind === "switch") {
    const label = control.label.trim();
    return (
      <MetaControlTitleStack
        {...getTitleProps(props)}
        containerClassName="@container/meta-switch"
        titleClassName="hidden @[140px]/meta-switch:block"
        contentClassName="items-center justify-between gap-3"
      >
        {label ? (
          <span
            className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} min-w-0 truncate text-xs font-semibold text-setta-700 dark:text-setta-300`}
          >
            {label}
          </span>
        ) : null}
        <MetaSwitchValueControl
          ariaLabel={control.ariaLabel}
          sectionId={props.sectionId}
          value={control.value}
          onValueChange={control.onValueChange}
          disabled={control.disabled}
        />
      </MetaControlTitleStack>
    );
  }
  if (control.kind === "color") {
    return (
      <MetaControlTitleStack
        {...getTitleProps(props)}
        contentClassName="items-stretch"
      >
        <ColorValueControl
          ariaLabel={control.ariaLabel}
          sectionId={props.sectionId}
          itemId={control.controlId}
          value={control.value}
          onValueChange={control.onValueChange}
          choices={control.choices}
          disabled={control.disabled}
        />
      </MetaControlTitleStack>
    );
  }
  if (control.kind === "dropdown") {
    return (
      <MetaControlTitleStack
        {...getTitleProps(props)}
        contentClassName="items-center"
      >
        <MetaDropdownValueControl
          ariaLabel={control.ariaLabel}
          value={control.value}
          onValueChange={control.onValueChange}
          choices={control.choices}
          placeholder={control.placeholder}
          disabled={control.disabled}
        />
      </MetaControlTitleStack>
    );
  }
  return null;
}

function renderDateTimeMetaControl(
  props: MetaValueControlProps,
): ReactNode | null {
  const { control } = props;
  if (control.kind === "date") {
    return (
      <MetaControlTitleStack
        {...getTitleProps(props)}
        contentClassName="items-stretch"
      >
        <MetaDateValueControl
          ariaLabel={control.ariaLabel}
          sectionId={props.sectionId}
          value={control.value}
          onValueChange={control.onValueChange}
          displayFormat={control.displayFormat}
          controlMode={control.controlMode}
          selectionMode={control.selectionMode}
          weekStart={control.weekStart}
          includeTime={control.includeTime}
          timeDisplayFormat={control.timeDisplayFormat}
          disabled={control.disabled}
        />
      </MetaControlTitleStack>
    );
  }
  if (control.kind === "time") {
    return (
      <MetaControlTitleStack
        {...getTitleProps(props)}
        contentClassName="items-stretch"
      >
        <MetaTimeValueControl
          ariaLabel={control.ariaLabel}
          sectionId={props.sectionId}
          value={control.value}
          onValueChange={control.onValueChange}
          controlMode={control.controlMode}
          displayFormat={control.displayFormat}
          transparent={control.transparent}
          scale={control.scale}
          font={control.font}
          disabled={control.disabled}
        />
      </MetaControlTitleStack>
    );
  }
  return null;
}

function renderSecureOrDropMetaControl(
  props: MetaValueControlProps,
): ReactNode | null {
  const { control } = props;
  if (control.kind === "password") {
    return (
      <MetaControlTitleStack
        {...getTitleProps(props)}
        contentClassName="items-stretch"
      >
        <MetaPasswordValueControl
          ariaLabel={control.ariaLabel}
          sectionId={props.sectionId}
          controlId={control.controlId}
          value={control.value}
          onValueChange={control.onValueChange}
          placeholder={control.placeholder}
          disabled={control.disabled}
        />
      </MetaControlTitleStack>
    );
  }
  if (control.kind === "dropzone") {
    return (
      <MetaControlTitleStack
        {...getTitleProps(props)}
        contentClassName="items-stretch"
      >
        <DropzoneValueControl
          ariaLabel={control.ariaLabel}
          sectionId={props.sectionId}
          controlId={control.controlId}
          attachments={control.attachments}
          policy={control.policy}
          onAccepted={control.onAccepted}
          onRejected={control.onRejected}
          onServerFilePickerRequest={control.onServerFilePickerRequest}
          onAttachmentRemove={control.onAttachmentRemove}
          placeholder={control.placeholder}
          pending={control.pending}
          errorMessage={control.errorMessage}
          disabled={control.disabled}
        />
      </MetaControlTitleStack>
    );
  }
  return null;
}

function getTitleProps({
  sectionName,
  showSectionTitle,
}: MetaValueControlProps) {
  return { sectionName, showSectionTitle };
}

function failUnknownMetaControl(control: { kind?: unknown }): never {
  throw new Error(
    `Unknown meta control kind: ${String((control as { kind?: unknown }).kind)}.`,
  );
}
