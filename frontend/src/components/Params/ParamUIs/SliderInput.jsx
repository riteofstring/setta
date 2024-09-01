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
  sliderRootClassName,
  sliderTrackClassName,
  sliderRangeClassName,
  sliderThumbClassName,
  setInputIsActive,
}) {
  const valueNum = _.toNumber(value);

  return (
    <Slider.Root
      className={sliderRootClassName}
      value={[valueNum]}
      defaultValue={[defaultVal]}
      min={min}
      max={max}
      step={step}
      disabled={isDisabled}
      onValueChange={(v) => onChange(v[0])}
      onPointerDown={() => setInputIsActive(true)}
      onPointerUp={() => setInputIsActive(false)}
    >
      <Slider.Track className={sliderTrackClassName}>
        <Slider.Range className={sliderRangeClassName} />
      </Slider.Track>
      <Slider.Thumb className={sliderThumbClassName} />
    </Slider.Root>
  );
}
