import * as Slider from "@radix-ui/react-slider";
import _ from "lodash";
import { useEffect, useState } from "react";
import { SimpleConfig } from "./SimpleConfig";

export function SliderInputConfig({ onChange, config }) {
  const options = ["min", "max", "step"];
  const [localConfig, setLocalConfig] = useState(config);

  function localOnChange(configName, value) {
    // set local value to whatever the user enters
    setLocalConfig({ ...localConfig, [configName]: value });

    // update global state to local state whenever the local state changes, if the local state is valid
    if (value === "") {
      return;
    }
    const asNum = _.toNumber(value);
    if (
      asNum !== config[configName] &&
      _.isFinite(asNum) &&
      configMakesSense(configName, asNum, config)
    ) {
      onChange(configName, () => asNum);
    }
  }

  // set local value to whatever the global state is
  function onBlur(configName) {
    setLocalConfig({ ...localConfig, [configName]: config[configName] });
  }

  // update local value if global state changes
  // But it's more complicated because we don't want to overwrite local state unnecessarily
  // because it ends up changing the text formatting which is very annoying.
  // For example, if the user types 1e2, we don't want it to immediately change to "100".
  // It should only change to "100" onBlur
  useEffect(() => {
    let shouldUpdate = false;
    for (const [k, v] of Object.entries(localConfig)) {
      if (_.toNumber(v) !== config[k]) {
        shouldUpdate = true;
      }
    }
    if (shouldUpdate) {
      setLocalConfig(config);
    }
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

function configMakesSense(configName, newConfigVal, config) {
  let { step, min, max } = config;
  if (configName === "min") {
    min = newConfigVal;
  } else if (configName === "max") {
    max = newConfigVal;
  } else {
    step = newConfigVal;
  }
  return min < max && step <= max - min;
}

export function SliderInput({
  value,
  defaultVal,
  onChange,
  min,
  max,
  step,
  isDisabled,
  area = "card-value",
}) {
  const valueNum = _.toNumber(value);

  return (
    <Slider.Root
      className={`${area} data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-40 touch-none select-none items-center data-[orientation='horizontal']:h-5`}
      aria-label="slider"
      value={[valueNum]}
      defaultValue={[defaultVal]}
      min={min}
      max={max}
      step={step}
      disabled={isDisabled}
      onValueChange={(v) => onChange(v[0])}
    >
      <Slider.Track className="relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700">
        <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
      </Slider.Track>
      <Slider.Thumb
        className="block h-3 w-3 cursor-pointer
      rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:bg-setta-100 focus:border-blue-500 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600"
      />
    </Slider.Root>
  );
}
