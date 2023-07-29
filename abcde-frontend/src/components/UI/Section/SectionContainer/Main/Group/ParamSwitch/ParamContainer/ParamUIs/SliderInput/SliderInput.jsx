import * as Slider from "@radix-ui/react-slider";
import _ from "lodash";
import { useEffect, useState } from "react";
import { debouncedIncrementVersionFn } from "thunks/undo";
import { SimpleConfig } from "../SimpleConfig";

export function SliderInputConfig({ onChange, config }) {
  const options = ["min", "max", "step"];
  const [localConfig, setLocalConfig] = useState(config);
  console.log("localConfig", localConfig);

  function localOnChange(configName, value) {
    // set local value to whatever the user enters
    setLocalConfig({ ...localConfig, [configName]: value });

    // update global state to local state whenever the local state changes
    // if the local state is valid
    if (value === "") {
      return;
    }
    const asNum = _.toNumber(value);
    if (asNum !== config[configName] && _.isFinite(asNum)) {
      // config values must make sense
      if (
        (configName === "min" && asNum < config["max"]) ||
        (configName === "max" && asNum > config["min"]) ||
        (configName === "step" && asNum <= config["max"] - config["min"])
      ) {
        onChange(configName, () => asNum);
        debouncedIncrementVersionFn();
      }
    }
  }

  // set local value to whatever the global state is
  function onBlur(configName) {
    setLocalConfig({ ...localConfig, [configName]: config[configName] });
  }

  // update local value if global state changes
  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  return (
    <SimpleConfig
      options={options}
      onChange={localOnChange}
      onBlur={onBlur}
      config={localConfig}
    />
  );
}

export function SliderInput({
  value,
  defaultVal,
  onChange,
  onBlur,
  min,
  max,
  step,
  isDisabled,
}) {
  const valueNum = _.toNumber(value);

  // enforces min <= valueNum <= max, if min and max change
  useEffect(() => {
    const newVal = Math.max(min, Math.min(valueNum, max));
    if (newVal !== valueNum) {
      onBlur(newVal, false);
    }
  }, [min, max]);

  return (
    <Slider.Root
      className="data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-40 touch-none select-none items-center data-[orientation='horizontal']:h-5"
      aria-label="slider"
      value={[valueNum]}
      defaultValue={[defaultVal]}
      min={min}
      max={max}
      step={step}
      disabled={isDisabled}
      onValueChange={(v) => onChange(v[0])}
      onValueCommit={(v) => onBlur(v[0])}
    >
      <Slider.Track className="relative flex-grow rounded-full bg-slate-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-slate-700">
        <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
      </Slider.Track>
      <Slider.Thumb
        className="block h-3 w-3 cursor-pointer
      rounded-full border-2 border-slate-300 bg-white shadow-sm drop-shadow-md hover:bg-slate-100 focus:border-blue-500 focus-visible:outline-none dark:border-slate-400 dark:bg-slate-600"
      />
    </Slider.Root>
  );
}
