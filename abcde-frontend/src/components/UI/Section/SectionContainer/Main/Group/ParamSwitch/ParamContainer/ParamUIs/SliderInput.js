import {
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  HStack,
} from "@chakra-ui/react";
import SimpleConfig from "./SimpleConfig";

function defaultIfNotNumber(x) {
  return typeof x === "number" ? x : 0;
}

function tryParseFloat(x) {
  return x ? parseFloat(x) : x;
}

export function SliderInputConfig({ onChange, savedConfig }) {
  const options = ["min", "max", "step"];
  return (
    <HStack>
      <SimpleConfig
        options={options}
        onChange={onChange}
        savedConfig={savedConfig}
      />
    </HStack>
  );
}

export default function SliderInput({
  value,
  onChangeEnd,
  min,
  max,
  step,
  isDisabled,
}) {
  return (
    <Slider
      aria-label="slider-ex-1"
      onChange={(v) => onChangeEnd(v)}
      value={defaultIfNotNumber(value)}
      min={tryParseFloat(min)}
      max={tryParseFloat(max)}
      step={tryParseFloat(step)}
      isDisabled={isDisabled}
    >
      <SliderTrack>
        <SliderFilledTrack />
      </SliderTrack>
      <SliderThumb />
    </Slider>
  );
}
