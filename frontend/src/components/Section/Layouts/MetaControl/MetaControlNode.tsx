import { ColorPickerInput } from "components/Params/ParamUIs/ColorPickerInput";
import { DropdownInput } from "components/Params/ParamUIs/DropdownInput";
import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { RotaryInput } from "components/Params/ParamUIs/RotaryInput";
import { SliderInput } from "components/Params/ParamUIs/SliderInput";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import { type DragEvent } from "react";
import { FiUploadCloud } from "react-icons/fi";
import { useParamCodeObjUIConfig } from "state/hooks/uiTypes";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { CodeObjType, CodeObjTypeEnum } from "utils/generatedTypes";

export function MetaControlContent({
  sectionId,
  controlParamId,
  codeObjType,
  value,
  defaultVal,
  onValueChange,
}: {
  sectionId: string;
  controlParamId: string;
  codeObjType: CodeObjType;
  value: string;
  defaultVal: string;
  onValueChange: (value: string) => void;
}) {
  switch (codeObjType) {
    case CodeObjTypeEnum.CodeParam:
    case CodeObjTypeEnum.TextParam:
      return (
        <TextInputControl
          sectionId={sectionId}
          controlParamId={controlParamId}
          value={value}
          defaultVal={defaultVal}
          onValueChange={onValueChange}
          language="python"
          singleLine={true}
        />
      );
    case CodeObjTypeEnum.TextAreaParam:
      return (
        <TextInputControl
          sectionId={sectionId}
          controlParamId={controlParamId}
          value={value}
          defaultVal={defaultVal}
          onValueChange={onValueChange}
          language="markdown"
          singleLine={false}
          minHeightClassName="min-h-[96px]"
        />
      );
    case CodeObjTypeEnum.SliderParam:
      return (
        <SliderControl
          sectionId={sectionId}
          controlParamId={controlParamId}
          value={value}
          onValueChange={onValueChange}
        />
      );
    case CodeObjTypeEnum.RotaryParam:
      return (
        <RotaryControl
          sectionId={sectionId}
          controlParamId={controlParamId}
          value={value}
          onValueChange={onValueChange}
        />
      );
    case CodeObjTypeEnum.SwitchParam:
      return <SwitchControl value={value} onValueChange={onValueChange} />;
    case CodeObjTypeEnum.ColorPickerParam:
      return (
        <ColorControl
          sectionId={sectionId}
          controlParamId={controlParamId}
          value={value}
          onValueChange={onValueChange}
        />
      );
    case CodeObjTypeEnum.DropdownParam:
      return (
        <DropdownControl
          sectionId={sectionId}
          controlParamId={controlParamId}
          value={value}
          onValueChange={onValueChange}
        />
      );
    case CodeObjTypeEnum.PasswordParam:
      return <PasswordControl value={value} onValueChange={onValueChange} />;
    case CodeObjTypeEnum.DropzoneParam:
      return <DropzoneControl value={value} onValueChange={onValueChange} />;
    default:
      return null;
  }
}

function TextInputControl({
  sectionId,
  controlParamId,
  value,
  defaultVal,
  onValueChange,
  language,
  singleLine,
  minHeightClassName,
}: {
  sectionId: string;
  controlParamId: string;
  value: string;
  defaultVal: string;
  onValueChange: (value: string) => void;
  language: "python" | "markdown";
  singleLine: boolean;
  minHeightClassName?: string;
}) {
  const wrapperClassName = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} w-full min-w-0 rounded-lg border border-setta-300/70 bg-setta-50 px-3 py-2 text-[11px] font-mono text-setta-700 dark:border-setta-700 dark:bg-setta-850 dark:text-setta-200`;
  const sizeClassName = minHeightClassName ? ` ${minHeightClassName}` : "";

  return (
    <div className={`${wrapperClassName}${sizeClassName}`}>
      <TextInputCodeMirror
        dummyDivId={`${sectionId}-${controlParamId}-MetaControl`}
        sectionId={sectionId}
        paramInfoId={controlParamId}
        value={value}
        defaultVal={defaultVal}
        onChange={onValueChange}
        dummyCodeClassName="section-value w-full min-w-0 break-words"
        realCodeClassName="section-value w-full min-w-0 break-words"
        language={language}
        singleLine={singleLine}
        autocomplete={false}
      />
    </div>
  );
}

function SliderControl({
  sectionId,
  controlParamId,
  value,
  onValueChange,
}: {
  sectionId: string;
  controlParamId: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const { min, max, step } = useParamCodeObjUIConfig(
    sectionId,
    controlParamId,
    CodeObjTypeEnum.SliderParam,
  );
  const sliderRootClassName =
    "SliderRoot relative flex w-full flex-1 touch-none select-none items-center";
  const sliderTrackClassName =
    "relative flex-grow rounded-full bg-setta-200 h-[3px] dark:bg-setta-700";
  const sliderRangeClassName = "absolute h-full rounded-full bg-blue-500";
  const sliderThumbClassName = `${NO_DRAG_CLASS_NAME} block h-3 w-3 cursor-pointer rounded-full border-2 border-setta-300 bg-white shadow-sm hover:!bg-setta-100 dark:border-setta-400 dark:bg-setta-600`;

  function handleChange(nextValue: number) {
    onValueChange(String(nextValue));
  }

  return (
    <SliderInput
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={handleChange}
      wrapperDivClass={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} flex w-full min-w-0 items-center gap-2`}
      sliderRootClassName={sliderRootClassName}
      sliderTrackClassName={sliderTrackClassName}
      sliderRangeClassName={sliderRangeClassName}
      sliderThumbClassName={sliderThumbClassName}
      textInputClassName="hidden"
    />
  );
}

function RotaryControl({
  sectionId,
  controlParamId,
  value,
  onValueChange,
}: {
  sectionId: string;
  controlParamId: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const { min, max, step } = useParamCodeObjUIConfig(
    sectionId,
    controlParamId,
    CodeObjTypeEnum.RotaryParam,
  );

  function handleChange(nextValue: number) {
    onValueChange(String(nextValue));
  }

  return (
    <RotaryInput
      value={value}
      onChange={handleChange}
      min={min}
      max={max}
      step={step}
    />
  );
}

function SwitchControl({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const isOn = value === "true";

  function handleChange(nextValue: boolean) {
    onValueChange(String(nextValue));
  }

  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-[0.2em] text-setta-500 dark:text-setta-400">
          Enabled
        </span>
        <span className="font-mono text-xs text-setta-700 dark:text-setta-200">
          {isOn ? "On" : "Off"}
        </span>
      </div>
      <SwitchInput
        value={isOn}
        onChange={handleChange}
        outerDivClassName={`${NO_DRAG_CLASS_NAME} section-value flex justify-self-start self-center`}
      />
    </div>
  );
}

function ColorControl({
  sectionId,
  controlParamId,
  value,
  onValueChange,
}: {
  sectionId: string;
  controlParamId: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const { colorChoices } = useParamCodeObjUIConfig(
    sectionId,
    controlParamId,
    CodeObjTypeEnum.ColorPickerParam,
  );

  return (
    <ColorPickerInput
      colorChoices={colorChoices}
      value={value}
      onChange={onValueChange}
      wrapperClassName={`${NO_DRAG_CLASS_NAME} section-value single-cell-container min-w-0 w-[calc(100%_-_2px)] justify-self-start self-center h-[calc(100%_-_4px)] min-h-0`}
      colorPickerChoicesClasses="flex-1 cursor-pointer items-center overflow-hidden rounded-lg single-cell-container colorpicker h-full min-h-0 w-full min-w-0 items-center text-white"
    />
  );
}

function DropdownControl({
  sectionId,
  controlParamId,
  value,
  onValueChange,
}: {
  sectionId: string;
  controlParamId: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const { choices } = useParamCodeObjUIConfig(
    sectionId,
    controlParamId,
    CodeObjTypeEnum.DropdownParam,
  );

  function handleChange(nextValue: string | null) {
    if (nextValue === null) {
      return;
    }
    onValueChange(nextValue);
  }

  return (
    <DropdownInput
      choices={choices}
      value={value}
      onChange={handleChange}
      outerDivClasses={`${NO_DRAG_CLASS_NAME} section-value flex w-full justify-self-start self-center [&_search]:my-auto`}
      placeholder="Choose"
    />
  );
}

function PasswordControl({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="single-cell-container grid min-h-[19px] grid-cols-[1fr,auto]">
      <PasswordInput
        className={`${NO_DRAG_CLASS_NAME} single-cell-child flex w-full min-w-0 max-w-[calc(100%_-_1.1rem)] cursor-text select-text self-center justify-self-start font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]`}
        value={value}
        onChange={onValueChange}
        gridArea="single-cell-child"
      />
      <span className="single-cell-child border-box col-span-2 self-end border-b border-setta-200/50 dark:border-setta-600/30" />
    </div>
  );
}

function DropzoneControl({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      onValueChange(files.map((file) => file.name).join(", "));
      return;
    }
    const text = event.dataTransfer.getData("text");
    if (text) {
      onValueChange(text);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  const label = value === "" ? "Drop a file here" : value;

  return (
    <div
      className={`${NO_DRAG_CLASS_NAME} flex w-full items-center justify-center gap-2 rounded-xl border-4 border-dashed border-setta-300 bg-setta-50/70 px-4 py-3 text-xs font-bold uppercase tracking-widest text-setta-500/80 dark:border-setta-700 dark:bg-setta-900/50 dark:text-setta-500`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <FiUploadCloud className="text-base" />
      {label}
    </div>
  );
}
