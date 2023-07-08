import * as Slider from "@radix-ui/react-slider";
import { SimpleConfig } from "../SimpleConfig";

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
  return (
    <Slider.Root
      className="data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-40 touch-none select-none items-center data-[orientation='horizontal']:h-5"
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
