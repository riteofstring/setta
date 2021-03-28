import {
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
} from "@chakra-ui/react";

function defaultIfNotNumber(x) {
  return typeof x === "number" ? x : 0;
}

export default function SliderInput({ value, onChangeEnd }) {
  return (
    <Slider
      aria-label="slider-ex-1"
      onChange={(v) => onChangeEnd(v)}
      value={defaultIfNotNumber(value)}
    >
      <SliderTrack>
        <SliderFilledTrack />
      </SliderTrack>
      <SliderThumb />
    </Slider>
  );
}
