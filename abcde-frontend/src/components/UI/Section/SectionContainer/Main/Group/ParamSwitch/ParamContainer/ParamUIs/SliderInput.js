import {
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
} from "@chakra-ui/react";
import { useState } from "react";

function defaultIfNotNumber(x) {
  return typeof x === "number" ? x : 0;
}

export default function SliderInput({ value, defaultVal, sendState }) {
  const [liveValue, setLiveValue] = useState(defaultIfNotNumber(value));

  return (
    <Slider
      aria-label="slider-ex-1"
      defaultValue={defaultIfNotNumber(defaultVal)}
      onChangeEnd={(val) => {
        if (val !== value) sendState(val);
      }}
      onChange={setLiveValue}
      value={liveValue}
    >
      <SliderTrack>
        <SliderFilledTrack />
      </SliderTrack>
      <SliderThumb />
    </Slider>
  );
}
