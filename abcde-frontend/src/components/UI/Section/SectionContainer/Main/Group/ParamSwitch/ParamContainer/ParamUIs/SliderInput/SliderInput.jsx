import * as Slider from "@radix-ui/react-slider";
import SimpleConfig from "../SimpleConfig";

function defaultIfNotNumber(x, min) {
  return isNaN(x) ? min : x;
}

export function SliderInputConfig({ onChange, savedConfig }) {
  const options = ["min", "max", "step"];
  return (
    <SimpleConfig
      options={options}
      onChange={onChange}
      savedConfig={savedConfig}
    />
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
}) {
  return (
    <Slider.Root
      className="relative flex items-center select-none touch-none w-40 data-[orientation='horizontal']:h-5 data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot"
      aria-label="slider"
      value={[defaultIfNotNumber(parseFloat(value), min)]}
      defaultValue={[defaultIfNotNumber(parseFloat(defaultVal), min)]}
      min={parseFloat(min)}
      max={parseFloat(max)}
      step={parseFloat(step)}
      disabled={isDisabled}
      onValueChange={onChange}
      onValueCommit={onBlur}
    >
      <Slider.Track className="bg-gray-200 relative flex-grow rounded-full data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px]">
        <Slider.Range className="absolute bg-blue-500 rounded-full h-full" />
      </Slider.Track>
      <Slider.Thumb
        className="block w-3 h-3 bg-white
      border-2 border-gray-300 shadow-sm drop-shadow-md rounded-full hover:bg-gray-100 focus-visible:outline-none focus:border-blue-500 cursor-pointer"
      />
    </Slider.Root>
  );
}
