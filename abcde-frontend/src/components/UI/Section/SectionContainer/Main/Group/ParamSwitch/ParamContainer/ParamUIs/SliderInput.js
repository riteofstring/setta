import {
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
} from "@chakra-ui/react";

function defaultIfNotNumber(x) {
  return typeof x === "number" ? x : 0;
}

export function SliderInputConfig() {
  return ["min", "max", "step"];
}

export default function SliderInput({ value, onChangeEnd, min, max, step }) {
  return (
    <Slider
      aria-label="slider-ex-1"
      onChange={(v) => onChangeEnd(v)}
      value={defaultIfNotNumber(value)}
      min={min}
      max={max}
      step={step}
    >
      <SliderTrack>
        <SliderFilledTrack />
      </SliderTrack>
      <SliderThumb />
    </Slider>
  );
}
