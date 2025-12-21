import CodeMirror from "@uiw/react-codemirror";
import { ColorPickerInput } from "components/Params/ParamUIs/ColorPickerInput";
import { DropdownInput } from "components/Params/ParamUIs/DropdownInput";
import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { SliderInput } from "components/Params/ParamUIs/SliderInput";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useState, type ReactNode } from "react";
import { FiUploadCloud } from "react-icons/fi";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  NO_PAN_CLASS_NAME,
  NO_DRAG_CLASS_NAME,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { MetaControlType } from "utils/generatedTypes";

const META_CONTROL_ACCENTS: Record<MetaControlType, string> = {
  button: "bg-blue-500",
  dropdown: "bg-cyan-500",
  slider: "bg-emerald-500",
  switch: "bg-lime-500",
  rotary: "bg-amber-500",
  textInput: "bg-sky-500",
  textArea: "bg-orange-500",
  password: "bg-slate-500",
  color: "bg-rose-500",
  dropzone: "bg-teal-500",
};

export function MetaControlContent({
  metaControlType,
}: {
  metaControlType: MetaControlType;
}) {
  const accent = META_CONTROL_ACCENTS[metaControlType];
  let content: ReactNode = null;

  switch (metaControlType) {
    case "button":
      content = <ButtonControl />;
      break;
    case "dropdown":
      content = <DropdownControl />;
      break;
    case "slider":
      content = <SliderControl />;
      break;
    case "switch":
      content = <SwitchControl />;
      break;
    case "rotary":
      content = <RotaryControl accent={accent} />;
      break;
    case "textInput":
      content = <TextInputControl />;
      break;
    case "textArea":
      content = <TextAreaControl />;
      break;
    case "password":
      content = <PasswordControl />;
      break;
    case "color":
      content = <ColorControl />;
      break;
    case "dropzone":
      content = <DropzoneControl />;
      break;
    default:
      return null;
  }

  return (
    <div className="flex h-full w-full min-h-0 min-w-0 items-stretch">
      {content}
    </div>
  );
}

function ButtonControl() {
  const primaryButtonClasses = `${NO_DRAG_CLASS_NAME} flex h-8 flex-1 items-center justify-center rounded-lg bg-setta-200/30 px-3 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-200 dark:bg-setta-800/50 dark:text-setta-300 dark:hover:bg-setta-900`;
  const iconButtonClasses = `${NO_DRAG_CLASS_NAME} flex h-8 w-8 items-center justify-center rounded-lg bg-setta-200/30 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-200 dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-setta-900`;

  return (
    <div className="flex w-full items-center gap-2">
      <button
        type="button"
        className={primaryButtonClasses}
      >
        Fire
      </button>
      <button
        type="button"
        className={iconButtonClasses}
      >
        &gt;
      </button>
    </div>
  );
}

function DropdownControl() {
  const choices = ["Warm", "Neutral", "Cool"];
  const [value, setValue] = useState<string>(choices[0]);

  function onChange(nextValue: string | null) {
    if (nextValue === null) {
      return;
    }
    setValue(nextValue);
  }

  return (
    <DropdownInput
      choices={choices}
      value={value}
      onChange={onChange}
      outerDivClasses={`${NO_DRAG_CLASS_NAME} section-value flex w-full justify-self-start self-center [&_search]:my-auto`}
      placeholder="Choose tone"
    />
  );
}

function SliderControl() {
  const [value, setValue] = useState<number>(68);
  const sliderRootClassName = `${NO_DRAG_CLASS_NAME} data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-full flex-1 touch-none select-none items-center data-[orientation='horizontal']:h-5`;
  const sliderTrackClassName =
    "relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700";
  const sliderRangeClassName = "absolute h-full rounded-full bg-blue-500";
  const sliderThumbClassName = `${SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION} ${NO_DRAG_CLASS_NAME} block h-3 w-3 cursor-pointer rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:!bg-setta-100 hover:dark:!bg-setta-700 focus-visible:!border-blue-500 focus-visible:bg-blue-500 focus-visible:dark:bg-blue-700 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600 data-[disabled]:pointer-events-none`;
  const textInputClassName =
    "hidden my-auto mr-[1px] h-5/6 w-8 cursor-auto resize-none rounded-lg border border-solid border-setta-300/20 bg-white px-2 text-center font-mono text-xs focus-visible:border-blue-300 dark:border-setta-875 dark:bg-setta-875 dark:text-setta-300 @[132px]/slider:block";

  return (
    <SliderInput
      value={value}
      min={0}
      max={100}
      step={1}
      onChange={setValue}
      wrapperDivClass={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} cursor-pointer @container/slider section-value flex w-full min-w-0 items-center gap-1`}
      sliderRootClassName={sliderRootClassName}
      sliderTrackClassName={sliderTrackClassName}
      sliderRangeClassName={sliderRangeClassName}
      sliderThumbClassName={sliderThumbClassName}
      textInputClassName={textInputClassName}
    />
  );
}

function SwitchControl() {
  const [value, setValue] = useState<boolean>(true);

  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-[0.2em] text-setta-500 dark:text-setta-400">
          Enabled
        </span>
        <span className="text-xs font-mono text-setta-700 dark:text-setta-200">
          {value ? "On" : "Off"}
        </span>
      </div>
      <SwitchInput
        value={value}
        onChange={setValue}
        outerDivClassName={`${NO_DRAG_CLASS_NAME} section-value flex justify-self-start self-center`}
      />
    </div>
  );
}

function RotaryControl({ accent }: { accent: string }) {
  return (
    <div className="flex w-full items-center gap-3">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border border-setta-300/70 bg-gradient-to-br from-setta-50 via-setta-200 to-setta-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)] dark:border-setta-700/70 dark:from-setta-900 dark:via-setta-800 dark:to-setta-950" />
        <div className="absolute inset-[6px] rounded-full border border-setta-200/70 bg-setta-100 dark:border-setta-700/70 dark:bg-setta-850" />
        <div className="absolute inset-[13px] rounded-full bg-setta-50 dark:bg-setta-900" />
        <div
          className={`absolute left-1/2 top-[6px] h-3 w-[2px] -translate-x-1/2 rounded-full ${accent}`}
        />
        <div className="absolute inset-0 rounded-full border border-dashed border-setta-300/40 dark:border-setta-700/40" />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-[0.2em] text-setta-500 dark:text-setta-400">
          Level
        </span>
        <span className="text-xs font-mono text-setta-700 dark:text-setta-200">
          0.72
        </span>
      </div>
    </div>
  );
}

function TextInputControl() {
  const [value, setValue] = useState<string>("");

  return (
    <MetaControlCodeMirror
      value={value}
      onChange={setValue}
      placeholder="Type here..."
      singleLine={true}
      wrapperClassName="w-full min-w-0 rounded-lg border border-setta-300/70 bg-setta-50 px-3 py-1 dark:border-setta-700 dark:bg-setta-850"
      editorClassName="w-full text-[11px] font-mono text-setta-700 dark:text-setta-200 [&_.cm-content]:!py-0 [&_.cm-line]:!px-0"
    />
  );
}

function TextAreaControl() {
  const [value, setValue] = useState<string>(
    "### Notes\n- tag your workflow\n- keep it short",
  );
  const previewValue =
    value.trim() === "" ? "*Nothing here yet.*" : value;

  return (
    <div className="flex w-full flex-col gap-2">
      <MetaControlCodeMirror
        value={value}
        onChange={setValue}
        placeholder="Write markdown..."
        language="markdown"
        minHeight="96px"
        maxHeight="140px"
        wrapperClassName="w-full min-w-0 rounded-lg border border-setta-300/70 bg-setta-50 px-3 py-2 dark:border-setta-700 dark:bg-setta-850"
        editorClassName="w-full text-[11px] font-mono text-setta-700 dark:text-setta-200 [&_.cm-content]:!py-0 [&_.cm-line]:!px-0"
      />
      <div className="nodrag w-full max-h-32 overflow-y-auto rounded-lg border border-setta-200/70 bg-white px-3 py-2 text-[11px] text-setta-700 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          className="prose prose-sm min-w-full dark:prose-invert prose-headings:tracking-tight prose-headings:text-setta-400 prose-p:text-xs prose-code:before:hidden prose-code:after:hidden [&_*]:[word-wrap:break-word]"
        >
          {previewValue}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function PasswordControl() {
  const [value, setValue] = useState<string>("hunter2");

  return (
    <div className="single-cell-container grid min-h-[19px] grid-cols-[1fr,auto]">
      <PasswordInput
        className={`${NO_DRAG_CLASS_NAME} cursor-text select-text single-cell-child flex w-full min-w-0 max-w-[calc(100%_-_1.1rem)] self-center justify-self-start font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]`}
        value={value}
        onChange={setValue}
        gridArea="single-cell-child"
      />
      <span className="single-cell-child border-box col-span-2 self-end border-b border-setta-200/50 dark:border-setta-600/30" />
    </div>
  );
}

function ColorControl() {
  const [value, setValue] = useState<string>("#38bdf8");
  const colorChoices = [
    { color: "#38bdf8", description: "Sky" },
    { color: "#22c55e", description: "Field" },
    { color: "#f97316", description: "Flare" },
  ];

  return (
    <ColorPickerInput
      colorChoices={colorChoices}
      value={value}
      onChange={setValue}
      wrapperClassName={`${NO_DRAG_CLASS_NAME} section-value single-cell-container min-w-0 w-[calc(100%_-_2px)] justify-self-start self-center h-[calc(100%_-_4px)] min-h-0`}
      colorPickerChoicesClasses="flex-1 cursor-pointer items-center overflow-hidden rounded-lg single-cell-container colorpicker h-full min-h-0 w-full min-w-0 items-center text-white"
    />
  );
}

function DropzoneControl() {
  return (
    <div
      className={`${NO_DRAG_CLASS_NAME} flex w-full items-center justify-center gap-2 rounded-xl border-4 border-dashed border-setta-300 bg-setta-50/70 px-4 py-3 text-xs font-bold uppercase tracking-widest text-setta-500/80 dark:border-setta-700 dark:bg-setta-900/50 dark:text-setta-500`}
    >
      <FiUploadCloud className="text-base" />
      Drop A File Here.
    </div>
  );
}

type MetaControlCodeMirrorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  language?: "markdown" | "python" | "json" | "javascript" | "yaml" | null;
  singleLine?: boolean;
  wrapperClassName?: string;
  editorClassName?: string;
  minHeight?: string;
  maxHeight?: string;
};

function MetaControlCodeMirror({
  value,
  onChange,
  placeholder,
  language = null,
  singleLine = false,
  wrapperClassName = "",
  editorClassName = "",
  minHeight,
  maxHeight,
}: MetaControlCodeMirrorProps) {
  const theme = useCodeMirrorStyle();
  const extensions = getExtensions({
    language,
    singleLine,
    tabToAutocomplete: false,
    indentWithTab: !singleLine,
  });

  return (
    <div
      className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} w-full min-w-0 cursor-text select-text ${wrapperClassName}`.trim()}
    >
      <CodeMirror
        value={value}
        theme={theme}
        extensions={extensions}
        onChange={onChange}
        placeholder={placeholder}
        className={`${NO_DRAG_CLASS_NAME} cursor-text select-text ${editorClassName}`.trim()}
        minHeight={minHeight}
        maxHeight={maxHeight}
        indentWithTab={false}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          tabSize: 4,
        }}
      />
    </div>
  );
}
