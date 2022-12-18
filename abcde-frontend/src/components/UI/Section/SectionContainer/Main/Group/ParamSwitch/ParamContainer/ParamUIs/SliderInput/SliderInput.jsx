import * as Slider from "@radix-ui/react-slider";
import SimpleConfig from "../SimpleConfig";
import "./styles.css";

function defaultIfNotNumber(x) {
  return isNaN(x) ? 0 : x;
}

function tryParseFloat(x) {
  return x ? parseFloat(x) : x;
}

export function SliderInputConfig({ onChange, savedConfig }) {
  const options = ["min", "max", "step"];
  return (
    <div className="flex">
      <SimpleConfig
        options={options}
        onChange={onChange}
        savedConfig={savedConfig}
      />
    </div>
  );
}

export default function SliderInput({
  value,
  defaultVal,
  onChange,
  onBlur,
  min,
  max,
  step,
  isDisabled,
  className,
}) {
  return (
    <Slider.Root
      className={`${className} SliderRoot`}
      value={[defaultIfNotNumber(tryParseFloat(value))]}
      defaultValue={[defaultIfNotNumber(tryParseFloat(defaultVal))]}
      min={tryParseFloat(min)}
      max={tryParseFloat(max)}
      step={tryParseFloat(step)}
      disabled={isDisabled}
      onValueChange={onChange}
      onValueCommit={onBlur}
    >
      <Slider.Track className="SliderTrack">
        <Slider.Range className="SliderRange" />
      </Slider.Track>
      <Slider.Thumb className="SliderThumb" />
    </Slider.Root>
  );
}
