import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import C from "constants/constants.json";
import { useIdWaitingForLSPResult } from "state/hooks/lsp";
import { useGetParamUIType } from "state/hooks/uiTypes";
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
  maybeErrorMessage,
}) {
  const uiType = useGetParamUIType(sectionId, paramInfoId);
  const waitingForResult = useIdWaitingForLSPResult({ sectionId, paramInfoId });
  switch (uiType.type) {
    default:
      return (
        <>
          <TextInputCodeMirror
            sectionId={sectionId}
            paramInfoId={paramInfoId}
            value={value}
            defaultVal={defaultVal}
            onChange={onChange}
            isDisabled={isDisabled}
            dummyCodeClassName={`section-value self-end group/textinput ${maybeErrorMessage ? "[&_*]:!text-red-500" : ""} nodrag cursor-text select-text break-words font-mono text-xs [tab-size:4] [word-break:break-word]`}
            realCodeClassName={`nodrag self-end group/textinput ${maybeErrorMessage ? "[&_*]:!text-red-500" : ""} [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs section-value`}
            language="python"
          />
          {waitingForResult && (
            <i className="section-value gg-spinner self-center justify-self-end text-blue-500/70" />
          )}
          <span className="section-value grid-row- border-box self-end border-b border-setta-100 group-focus-within/textinput:border-blue-400 dark:border-setta-800" />
        </>
      );
    case C.SLIDER: {
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
          sliderRootClassName="section-value data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-full touch-none select-none items-center data-[orientation='horizontal']:h-5"
          sliderTrackClassName="relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700"
          sliderRangeClassName="absolute h-full rounded-full bg-blue-500"
          sliderThumbClassName="block h-3 w-3 cursor-pointer
      rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:bg-setta-100 focus:border-blue-500 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600"
        />
      );
    }
    case C.SWITCH:
      return (
        <SwitchInput
          value={value}
          defaultVal={defaultVal}
          onChange={onChange}
          isDisabled={isDisabled}
          outerDivClassName="section-value flex justify-self-start self-center"
          twRootClasses="nodrag"
        />
      );
  }
}

export function ParamSweepUI({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  isDisabled,
}) {
  const uiType = useGetParamUIType(sectionId, paramInfoId);
  const waitingForResult = useIdWaitingForLSPResult({ sectionId, paramInfoId });
  switch (uiType.type) {
    default:
      return (
        <>
          <TextInputCodeMirror
            sectionId={sectionId}
            paramInfoId={paramInfoId}
            value={value}
            defaultVal={defaultVal}
            onChange={onChange}
            isDisabled={isDisabled}
            dummyCodeClassName="section-key-value self-end grid-row-start-1 mx-3 py-[.125rem] nodrag cursor-text select-text break-words px-0 font-mono text-xs [tab-size:4] [word-break:break-word]"
            realCodeClassName="section-key-value self-end grid-row-start-1 py-[.125rem] mx-3 nodrag [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs first:[&_.cm-line>*]:mt-[3px]"
            language="python"
          />
          {waitingForResult && (
            <i className="section-value gg-spinner self-center justify-self-end text-blue-500/70" />
          )}
          <span className="section-key-value grid-row-start-1 border-box mx-3 self-end border-b border-setta-100 group-focus-within/textinput:border-blue-400 dark:border-setta-800" />
        </>
      );
    case C.SLIDER: {
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
          sliderRootClassName="section-key-value data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-full touch-none select-none items-center data-[orientation='horizontal']:h-5"
          sliderTrackClassName="relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700"
          sliderRangeClassName="absolute h-full rounded-full bg-blue-500"
          sliderThumbClassName="block h-3 w-3 cursor-pointer
      rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:bg-setta-100 focus:border-blue-500 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600"
        />
      );
    }
    case C.SWITCH:
      return (
        <SwitchInput
          value={value}
          defaultVal={defaultVal}
          onChange={onChange}
          isDisabled={isDisabled}
          outerDivClassName="section-key-value flex justify-self-center self-center"
          twRootClasses="nodrag"
        />
      );
  }
}
