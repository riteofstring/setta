import {
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
} from "@chakra-ui/react";

export default function SliderInput({ value, defaultVal, sendState }) {
  return (
    <Slider
      aria-label="slider-ex-1"
      value={value}
      defaultValue={defaultVal}
      onChangeEnd={(val) => sendState(val)}
      focusThumbOnChange={false}
    >
      <SliderTrack>
        <SliderFilledTrack />
      </SliderTrack>
      <SliderThumb />
    </Slider>
  );
}
