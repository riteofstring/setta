import { useParamCodeObjUIConfig } from "state/hooks/uiTypes";
import { CodeObjTypeEnum } from "utils/generatedTypes";
import { ButtonInput } from "./ButtonInput";
import { ColorPickerInput } from "./ColorPickerInput";
import { DropdownInput } from "./DropdownInput";
import { RotaryInput } from "./RotaryInput";
import { SliderInput } from "./SliderInput";

export type ParamValueChangeOptions = {
  skipBackendUpdate?: boolean;
};

export type ParamValueChange = (
  value: string | number | boolean | null,
  options?: ParamValueChangeOptions,
) => void;

type ConfiguredButtonInputProps = {
  sectionId: string;
  paramInfoId: string;
  onClick: () => void;
  wrapperClassName?: string;
  buttonClassName?: string;
  isDisabled?: boolean;
};

export function ConfiguredButtonInput({
  sectionId,
  paramInfoId,
  onClick,
  wrapperClassName,
  buttonClassName,
  isDisabled,
}: ConfiguredButtonInputProps) {
  const { label } = useParamCodeObjUIConfig(
    sectionId,
    paramInfoId,
    CodeObjTypeEnum.ButtonParam,
  );

  return (
    <ButtonInput
      label={label}
      onClick={onClick}
      wrapperClassName={wrapperClassName}
      buttonClassName={buttonClassName}
      isDisabled={isDisabled}
    />
  );
}

type ConfiguredSliderInputProps = {
  sectionId: string;
  paramInfoId: string;
  value: string;
  onChange: ParamValueChange;
  onCommit?: ParamValueChange;
  onEscape?: () => void;
  isDisabled?: boolean;
  wrapperDivClass: string;
  sliderRootClassName: string;
  sliderTrackClassName: string;
  sliderRangeClassName: string;
  sliderThumbClassName: string;
  textInputClassName: string;
};

export function ConfiguredSliderInput({
  sectionId,
  paramInfoId,
  value,
  onChange,
  onCommit,
  onEscape,
  isDisabled,
  wrapperDivClass,
  sliderRootClassName,
  sliderTrackClassName,
  sliderRangeClassName,
  sliderThumbClassName,
  textInputClassName,
}: ConfiguredSliderInputProps) {
  const { min, max, step } = useParamCodeObjUIConfig(
    sectionId,
    paramInfoId,
    CodeObjTypeEnum.SliderParam,
  );

  return (
    <SliderInput
      value={value}
      onChange={onChange}
      onCommit={onCommit}
      onEscape={onEscape}
      min={min}
      max={max}
      step={step}
      isDisabled={isDisabled}
      wrapperDivClass={wrapperDivClass}
      sliderRootClassName={sliderRootClassName}
      sliderTrackClassName={sliderTrackClassName}
      sliderRangeClassName={sliderRangeClassName}
      sliderThumbClassName={sliderThumbClassName}
      textInputClassName={textInputClassName}
    />
  );
}

type ConfiguredRotaryInputProps = {
  sectionId: string;
  paramInfoId: string;
  value: string;
  onChange: ParamValueChange;
  onCommit?: ParamValueChange;
  onEscape?: () => void;
  isDisabled?: boolean;
};

export function ConfiguredRotaryInput({
  sectionId,
  paramInfoId,
  value,
  onChange,
  onCommit,
  onEscape,
  isDisabled,
}: ConfiguredRotaryInputProps) {
  const { min, max, step } = useParamCodeObjUIConfig(
    sectionId,
    paramInfoId,
    CodeObjTypeEnum.RotaryParam,
  );

  return (
    <RotaryInput
      value={value}
      onChange={onChange}
      onCommit={onCommit}
      onEscape={onEscape}
      min={min}
      max={max}
      step={step}
      isDisabled={isDisabled}
    />
  );
}

type ConfiguredColorPickerInputProps = {
  sectionId: string;
  paramInfoId: string;
  value: string;
  onChange: ParamValueChange;
  onCommit?: ParamValueChange;
  onEscape?: () => void;
  isDisabled?: boolean;
  wrapperClassName: string;
  colorPickerChoicesClasses: string;
};

export function ConfiguredColorPickerInput({
  sectionId,
  paramInfoId,
  value,
  onChange,
  onCommit,
  onEscape,
  isDisabled,
  wrapperClassName,
  colorPickerChoicesClasses,
}: ConfiguredColorPickerInputProps) {
  const { colorChoices } = useParamCodeObjUIConfig(
    sectionId,
    paramInfoId,
    CodeObjTypeEnum.ColorPickerParam,
  );

  return (
    <ColorPickerInput
      colorChoices={colorChoices}
      value={value}
      onChange={onChange}
      onCommit={onCommit}
      onEscape={onEscape}
      wrapperClassName={wrapperClassName}
      colorPickerChoicesClasses={colorPickerChoicesClasses}
      isDisabled={isDisabled}
    />
  );
}

type ConfiguredDropdownInputProps = {
  sectionId: string;
  paramInfoId: string;
  value: string | null;
  onChange: ParamValueChange;
  outerDivClasses: string;
  inputOuterClasses?: string;
  isDisabled?: boolean;
  placeholder?: string;
  small?: boolean;
};

export function ConfiguredDropdownInput({
  sectionId,
  paramInfoId,
  value,
  onChange,
  outerDivClasses,
  inputOuterClasses,
  isDisabled,
  placeholder,
  small,
}: ConfiguredDropdownInputProps) {
  const { choices } = useParamCodeObjUIConfig(
    sectionId,
    paramInfoId,
    CodeObjTypeEnum.DropdownParam,
  );

  return (
    <DropdownInput
      choices={choices}
      value={value}
      onChange={onChange}
      outerDivClasses={outerDivClasses}
      inputOuterClasses={inputOuterClasses}
      isDisabled={isDisabled}
      placeholder={placeholder}
      small={small}
    />
  );
}
