import * as Slider from "@radix-ui/react-slider";
import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import _ from "lodash";
import { updateParamImplConfig } from "openapi/http";
import { useEffect, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useShareCapabilities } from "state/hooks/share";
import {
  SliderConfigForFrontend,
  useParamCodeObjUIConfig,
} from "state/hooks/uiTypes";
import {
  type SliderParamCodeObjImpl,
  CodeObjTypeEnum,
} from "utils/generatedTypes";
import { clamp } from "utils/utils";
export function SliderInputConfigForParam({
  sectionId,
  paramInfoId,
}: {
  sectionId: string;
  paramInfoId: string;
}) {
  const { canEditStructure } = useShareCapabilities();
  const config = useParamCodeObjUIConfig(
    sectionId,
    paramInfoId,
    CodeObjTypeEnum.SliderParam,
  );
  function onChange(newConfig: SliderConfigForFrontend) {
    if (!canEditStructure) {
      return;
    }
    const configClone = _.cloneDeep(newConfig);
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveCodeObjImplValue<SliderParamCodeObjImpl>(
          state,
          sectionId,
          paramInfoId,
          configClone,
        );
      },
      send: (frontendOpId) =>
        callOpenAPI(
          updateParamImplConfig({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              paramInfoId,
              newConfig: configClone,
              frontendOpId,
            },
          } as Parameters<typeof updateParamImplConfig>[0]),
        ),
    });
  }
  return (
    <SliderInputConfig
      onChange={onChange}
      config={config}
      isDisabled={!canEditStructure}
    />
  );
}
function SliderInputConfig({
  onChange,
  config,
  isDisabled,
}: {
  onChange: (x: SliderConfigForFrontend) => void;
  config: SliderConfigForFrontend;
  isDisabled: boolean;
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
    onChange({ ...localConfig, [configName]: asNum });
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
          <input
            className={`nodrag font-code cursor-auto justify-end border-0 border-b border-solid border-setta-300 text-xs focus-visible:border-blue-400 dark:border-setta-700 dark:text-setta-300`}
            placeholder={e}
            key={`${e}-${idx}`}
            onChange={(v) => localOnChange(e, v.target.value)}
            onBlur={(v) => onBlur(e, v.target.value)}
            value={localConfig[e]}
            disabled={isDisabled}
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
  onChange,
  onEscape,
  onCommit,
  min,
  max,
  step,
  isDisabled = false,
  wrapperDivClass,
  sliderRootClassName,
  sliderTrackClassName,
  sliderRangeClassName,
  sliderThumbClassName,
  textInputClassName,
}: {
  value: string | number;
  onChange?: (x: number) => void;
  onEscape?: () => void;
  onCommit?: (x: number) => void;
  min: number;
  max: number;
  step: number;
  isDisabled?: boolean;
  wrapperDivClass?: string;
  sliderRootClassName?: string;
  sliderTrackClassName?: string;
  sliderRangeClassName?: string;
  sliderThumbClassName?: string;
  textInputClassName?: string;
}) {
  return (
    <div className={wrapperDivClass}>
      <SliderOnly
        value={value}
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
}: {
  className?: string | undefined;
  value: string | number;
  onChange?: ((x: number) => void) | undefined;
  onCommit?: ((x: number) => void) | undefined;
  onEscape?: (() => void) | undefined;
  min: number;
  max: number;
}) {
  const [tempValue, setTempValue] = useState(value);
  function localOnChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTempValue(e.target.value);
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement>) {
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
  onChange,
  onCommit,
  min,
  max,
  step,
  isDisabled = false,
  sliderRootClassName,
  sliderTrackClassName,
  sliderRangeClassName,
  sliderThumbClassName,
}: {
  value: string | number;
  onChange?: ((newVal: number) => void) | undefined;
  onCommit?: ((newVal: number) => void) | undefined;
  min: number;
  max: number;
  step: number;
  isDisabled?: boolean | undefined;
  sliderRootClassName?: string | undefined;
  sliderTrackClassName?: string | undefined;
  sliderRangeClassName?: string | undefined;
  sliderThumbClassName?: string | undefined;
}) {
  const asNum = _.toNumber(value);
  const valueNum = isNaN(asNum) ? min : clamp(_.toNumber(value), min, max);
  return (
    <Slider.Root
      className={sliderRootClassName}
      value={[valueNum]}
      min={min}
      max={max}
      step={step}
      disabled={isDisabled}
      onValueChange={(v) => {
        if (v[0] !== undefined) {
          onChange?.(v[0]);
        }
      }}
      onValueCommit={(v) => {
        if (v[0] !== undefined) {
          onCommit?.(v[0]);
        }
      }}
    >
      <Slider.Track className={sliderTrackClassName}>
        <Slider.Range className={sliderRangeClassName} />
      </Slider.Track>
      <Slider.Thumb className={sliderThumbClassName} />
    </Slider.Root>
  );
}
