import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import C from "constants/constants.json";
import {
  useCodeInfo,
  useParamShortcuts,
  useSectionInfos,
} from "state/definitions";
import { useTextFieldWaitingForLSPResult } from "state/hooks/lsp";
import { useGetParamUIType } from "state/hooks/uiTypes";
import { ColorPickerInput, ColorPickerInputConfig } from "./ColorPickerInput";
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
    case C.COLOR_PICKER:
      return <ColorPickerInputConfig {...props} />;
  }
}

export function ParamUI({
  sectionId,
  paramInfoId,
  value,
  onChange,
  maybeErrorMessage,
  keywordPositions,
  setKeywordPositions,
}) {
  const configLanguage = useSectionInfos((x) => x.x[sectionId].configLanguage);
  const uiType = useGetParamUIType(sectionId, paramInfoId);
  const waitingForResult = useTextFieldWaitingForLSPResult({
    sectionId,
    paramInfoId,
  });
  const isSelectingParams = useParamShortcuts((x) => x.isSelectingParams);
  const defaultVal = useCodeInfo((x) => x.x[paramInfoId].defaultVal);
  const isDisabled = useCodeInfo((x) => x.x[paramInfoId].isDisabled);
  const _isDisabled = isDisabled || isSelectingParams;

  // need to put the group/textinput in a higher div

  switch (uiType.type) {
    default:
      return (
        <>
          <TextInputCodeMirror
            dataSectionId={sectionId}
            visualSectionId={sectionId}
            paramInfoId={paramInfoId}
            value={value}
            defaultVal={defaultVal}
            onChange={onChange}
            dummyCodeClassName={`section-value self-end peer/textinput ${maybeErrorMessage ? "[&_*]:!text-red-500" : ""} nodrag ${!_isDisabled ? "cursor-text select-text" : ""} break-words font-mono text-xs [tab-size:4] [word-break:break-word] py-[.125rem]`}
            realCodeClassName={`nodrag self-end peer/textinput ${maybeErrorMessage ? "[&_*]:!text-red-500" : ""} [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs section-value py-[.125rem]`}
            language={configLanguage}
            keywordPositions={keywordPositions}
            setKeywordPositions={setKeywordPositions}
            isDisabled={_isDisabled}
          />
          {waitingForResult && (
            <i className="section-value gg-spinner self-center justify-self-end text-blue-500/70" />
          )}
          <span className="section-value grid-row-start-1 border-box self-end border-b border-setta-100 peer-focus-within/textinput:border-blue-400 dark:border-setta-800" />
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
          isDisabled={_isDisabled}
          wrapperDivClass="section-value flex gap-1"
          sliderRootClassName=" data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-full touch-none select-none items-center data-[orientation='horizontal']:h-5"
          sliderTrackClassName="relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700"
          sliderRangeClassName="absolute h-full rounded-full bg-blue-500"
          sliderThumbClassName="block h-3 w-3 cursor-pointer
      rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:bg-setta-100 focus:border-blue-500 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600 data-[disabled]:pointer-events-none"
          textInputClassName="my-auto mr-[1px] h-5/6 w-8 cursor-auto resize-none rounded-lg border border-solid border-setta-300/20 bg-white px-2 text-center font-mono text-xs focus-visible:border-blue-300 dark:border-setta-875 dark:bg-setta-875 dark:text-setta-300"
        />
      );
    }
    case C.SWITCH:
      return (
        <SwitchInput
          value={value}
          defaultVal={defaultVal}
          onChange={onChange}
          isDisabled={_isDisabled}
          outerDivClassName="section-value flex justify-self-start self-center"
          twRootClasses="nodrag"
        />
      );
    case C.COLOR_PICKER:
      const { colorChoices } = uiType.config;
      return (
        <ColorPickerInput
          id={`${sectionId}-${paramInfoId}-color-picker`}
          colorChoices={colorChoices}
          value={value}
          onChange={onChange}
          wrapperClassName="section-value flex justify-self-start self-center"
        />
      );
  }
}

export function ParamSweepUI({
  dataSectionId,
  visualSectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  isDisabled,
  keywordPositions,
  setKeywordPositions,
}) {
  const configLanguage = useSectionInfos(
    (x) => x.x[dataSectionId].configLanguage,
  );
  const uiType = useGetParamUIType(dataSectionId, paramInfoId);
  const waitingForResult = useTextFieldWaitingForLSPResult({
    dataSectionId,
    paramInfoId,
  });
  switch (uiType.type) {
    default:
      return (
        <>
          <TextInputCodeMirror
            dataSectionId={dataSectionId}
            visualSectionId={visualSectionId}
            paramInfoId={paramInfoId}
            value={value}
            defaultVal={defaultVal}
            onChange={onChange}
            isDisabled={isDisabled}
            dummyCodeClassName="section-key-value self-end grid-row-start-1 mx-3 py-[.125rem] nodrag cursor-text select-text break-words px-0 font-mono text-xs [tab-size:4] [word-break:break-word]"
            realCodeClassName="section-key-value self-end grid-row-start-1 py-[.125rem] mx-3 nodrag [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs first:[&_.cm-line>*]:mt-[3px]"
            language={configLanguage}
            keywordPositions={keywordPositions}
            setKeywordPositions={setKeywordPositions}
          />
          {waitingForResult && (
            <i className="section-value gg-spinner self-center justify-self-end text-blue-500/70" />
          )}
          <span className="section-key-value grid-row-start-1 border-box mx-3 self-end border-b border-setta-100 peer-focus-within/textinput:border-blue-400 dark:border-setta-800" />
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
          wrapperDivClass="section-key-value flex gap-1"
          sliderRootClassName="data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-full touch-none select-none items-center data-[orientation='horizontal']:h-5"
          sliderTrackClassName="relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700"
          sliderRangeClassName="absolute h-full rounded-full bg-blue-500"
          sliderThumbClassName="block h-3 w-3 cursor-pointer
      rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:bg-setta-100 focus:border-blue-500 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600"
          textInputClassName="w-8 cursor-auto resize-none rounded-lg border border-solid border-setta-300/20 bg-white px-2 text-center font-mono text-xs focus-visible:border-blue-300 dark:border-setta-875 dark:bg-setta-875 dark:text-setta-300"
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
    case C.COLOR_PICKER:
      return (
        <ColorPickerInput
          id={`${sectionId}-${paramInfoId}-color-picker-param-sweep`}
          colorChoices={colorChoices}
          value={value}
          onChange={onChange}
          wrapperClassName="section-value flex justify-self-start self-center"
        />
      );
  }
}
