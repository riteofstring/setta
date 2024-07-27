import C from "constants/constants.json";
import { useGetParamUIType } from "state/hooks/uiTypes";
import { TextInputCodeMirror } from "utils/CodeMirror/TextInputCodeMirror";
import { SliderInput, SliderInputConfig } from "./SliderInput";
import { SwitchInput, SwitchInputConfig } from "./SwitchInput";
import { TextInputConfig } from "./TextInput";

export function ParamUIConfig({ name, ...props }) {
  switch (name) {
    default:
      return <TextInputConfig {...props} />;
    case C.SLIDER:
      return <SliderInputConfig {...props} />;
    case C.SWITCH:
      return <SwitchInputConfig {...props} />;
  }
}

export function ParamUI({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  isDisabled,
}) {
  const uiType = useGetParamUIType(sectionId, paramInfoId);
  switch (uiType.type) {
    default:
      return (
        <TextInputCodeMirror
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          defaultVal={defaultVal}
          onChange={onChange}
          isDisabled={isDisabled}
          dummyCodeClassName="card-value nodrag cursor-text select-text break-words pl-[6px] pr-[2px] font-mono text-xs [tab-size:4] [word-break:break-word]"
          realCodeClassName="nodrag [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:rounded-md [&_.cm-content]:!py-0 [&_.cm-content]:text-xs first:[&_.cm-line>*]:mt-[3px] card-value"
        />
      );
    case C.SLIDER:
      const { min, max, step } = uiType.config;
      return (
        <SliderInput
          value={value}
          defaultVal={defaultVal}
          onChange={onChange}
          min={min}
          max={max}
          step={step}
          isDisabled={isDisabled}
          sliderRootClassName="card-value data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-40 touch-none select-none items-center data-[orientation='horizontal']:h-5"
          sliderTrackClassName="relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700"
          sliderRangeClassName="absolute h-full rounded-full bg-blue-500"
          sliderThumbClassName="block h-3 w-3 cursor-pointer
      rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:bg-setta-100 focus:border-blue-500 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600"
        />
      );
    case C.SWITCH:
      return (
        <SwitchInput
          value={value}
          defaultVal={defaultVal}
          onChange={onChange}
          isDisabled={isDisabled}
          outerDivClassName="card-value flex  place-self-center"
          twRootClasses="nodrag"
        />
      );
  }
}
