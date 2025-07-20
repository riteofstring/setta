import * as Slider from "@radix-ui/react-slider";
import { StandardInput } from "components/Utils/atoms/input/StandardInput";
import _ from "lodash";
import { useEffect, useState } from "react";
import {
  SliderConfigForFrontend,
  useParamCodeObjUIConfig,
} from "state/hooks/uiTypes";
import { CodeObjTypeEnum } from "utils/generatedTypes";
import { clamp } from "utils/utils";

export function SliderInputConfigForParam({
  sectionId,
  paramInfoId,
}: {
  sectionId: string;
  paramInfoId: string;
}) {
  const config = useParamCodeObjUIConfig(
    sectionId,
    paramInfoId,
    CodeObjTypeEnum.SliderParam,
  );

  function onChange() {
    console.log("onChange");
  }

  return <SliderInputConfig onChange={onChange} config={config} />;
}

export function SliderInputConfig({
  onChange,
  config,
}: {
  onChange: any;
  config: SliderConfigForFrontend;
}) {
  const [localConfig, setLocalConfig] = useState(config);

  function localOnChange(
    configName: keyof SliderConfigForFrontend,
    value: string,
  ) {
    setLocalConfig({ ...localConfig, [configName]: value });
  }

  function onBlur(configName: keyof SliderConfigForFrontend, value: string) {
    const asNum = _.toNumber(value);
    if (
      value === "" ||
      !_.isFinite(asNum) ||
      !configMakesSense(configName, asNum, localConfig)
    ) {
      setLocalConfig(config);
      return;
    }
    onChange(configName, () => asNum);
  }

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  return (
    <div className="mt-1 flex flex-col">
      {Object.keys(config).map((e, idx) => (
        <div
          className="flex flex-grow items-center justify-between rounded-full px-3 py-[0.33rem] hover:bg-[#cbd5e02b]"
          key={`SimpleConfig-${idx}`}
        >
          <p className="flex-1 font-sans text-xs font-semibold text-setta-600">
            {e}
          </p>
          <StandardInput
            twClasses="justify-end"
            placeholder={e}
            key={`${e}-${idx}`}
            onChange={(v) => localOnChange(e, v.target.value)}
            onBlur={(v) => onBlur(e, v.target.value)}
            value={config[e]}
          />
        </div>
      ))}
    </div>
  );
}

function configMakesSense(
  configName: keyof SliderConfigForFrontend,
  newConfigVal: number,
  config: SliderConfigForFrontend,
): boolean {
  const updatedConfig: SliderConfigForFrontend = {
    ...config,
    [configName]: newConfigVal,
  };

  const { min, max, step } = updatedConfig;
  return min < max && step <= max - min;
}
export function SliderInput({
  value,
  defaultVal,
  onChange,
  onEscape,
  onCommit,
  min,
  max,
  step,
  isDisabled,
  wrapperDivClass,
  sliderRootClassName,
  sliderTrackClassName,
  sliderRangeClassName,
  sliderThumbClassName,
  textInputClassName,
}) {
  return (
    <div className={wrapperDivClass}>
      <SliderOnly
        value={value}
        defaultVal={defaultVal}
        onChange={onChange}
        onCommit={onCommit}
        min={min}
        max={max}
        step={step}
        isDisabled={isDisabled}
        sliderRootClassName={sliderRootClassName}
        sliderTrackClassName={sliderTrackClassName}
        sliderRangeClassName={sliderRangeClassName}
        sliderThumbClassName={sliderThumbClassName}
      />
      <SliderTextField
        className={textInputClassName}
        value={value}
        onChange={onChange}
        onCommit={onCommit}
        onEscape={onEscape}
        min={min}
        max={max}
      />
    </div>
  );
}

function SliderTextField({
  className,
  value,
  onChange,
  onCommit,
  onEscape,
  min,
  max,
  step,
}) {
  const [tempValue, setTempValue] = useState(value);
  function localOnChange(e) {
    setTempValue(e.target.value);
  }

  function onBlur(e) {
    const num = _.toNumber(e.target.value);
    if (e.target.value === "" || !_.isFinite(num)) {
      setTempValue(value);
      return;
    }
    const clamped = clamp(num, min, max);
    setTempValue(clamped);
    onChange?.(clamped);
    onCommit?.(clamped);
  }

  useEffect(() => {
    setTempValue(value);
  }, [value]);

  return (
    <input
      className={className}
      value={tempValue}
      onChange={localOnChange}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.code === "Escape") {
          onEscape?.();
        }
      }}
    />
  );
}

function SliderOnly({
  value,
  defaultVal,
  onChange,
  onCommit,
  min,
  max,
  step,
  isDisabled,
  sliderRootClassName,
  sliderTrackClassName,
  sliderRangeClassName,
  sliderThumbClassName,
}) {
  const asNum = _.toNumber(value);
  const valueNum = isNaN(asNum) ? min : clamp(_.toNumber(value), min, max);

  return (
    <Slider.Root
      className={sliderRootClassName}
      value={[valueNum]}
      defaultValue={[defaultVal]}
      min={min}
      max={max}
      step={step}
      disabled={isDisabled}
      onValueChange={(v) => onChange?.(v[0])}
      onValueCommit={(v) => onCommit?.(v[0])}
    >
      <Slider.Track className={sliderTrackClassName}>
        <Slider.Range className={sliderRangeClassName} />
      </Slider.Track>
      <Slider.Thumb className={sliderThumbClassName} />
    </Slider.Root>
  );
}
