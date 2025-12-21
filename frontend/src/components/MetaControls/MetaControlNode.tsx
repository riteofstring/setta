import { ColorPickerInput } from "components/Params/ParamUIs/ColorPickerInput";
import { SliderInput } from "components/Params/ParamUIs/SliderInput";
import { SectionTitle } from "components/Section/Header/SectionTitle";
import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import type { ReactNode } from "react";
import type { MetaControl, MetaControlType } from "state/definitions";
import {
  NO_DRAG_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";

const META_CONTROL_WIDTH: Record<MetaControlType, string> = {
  button: "w-44",
  slider: "w-56",
  knob: "w-44",
  text: "w-64",
  color: "w-44",
  dropzone: "w-64",
};

const META_CONTROL_ACCENTS: Record<MetaControlType, string> = {
  button: "bg-blue-500",
  slider: "bg-emerald-500",
  knob: "bg-amber-500",
  text: "bg-sky-500",
  color: "bg-rose-500",
  dropzone: "bg-teal-500",
};

type MetaControlNodeProps = {
  control: MetaControl;
  showChrome: boolean;
};

const META_CONTROL_TITLE_PROPS = {
  fixed:
    "select-none truncate text-[0.7rem] font-semibold tracking-tight text-setta-600 dark:text-setta-300",
};

const META_CONTROL_MENU_BUTTON_CLASSES =
  "nodrag flex h-[14px] w-[14px] items-center justify-center rounded-full p-1 text-setta-700 transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800";

const META_CONTROL_LOCK_BUTTON_CLASSES =
  "nodrag flex h-4 w-4 items-center justify-center rounded-full text-setta-500 transition-colors duration-150 hover:text-orange-500 dark:text-setta-400 dark:hover:text-orange-400";

const META_CONTROL_CLOSE_BUTTON_CLASSES =
  "nodrag flex h-4 w-4 items-center justify-center rounded-full text-setta-500 transition-colors duration-150 hover:text-red-500 dark:text-setta-400 dark:hover:text-red-400";

export function MetaControlNode({
  control,
  showChrome,
}: MetaControlNodeProps) {
  const accent = META_CONTROL_ACCENTS[control.type];
  const widthClass = META_CONTROL_WIDTH[control.type];
  let content: ReactNode = null;

  switch (control.type) {
    case "button":
      content = <ButtonControl />;
      break;
    case "slider":
      content = <SliderControl accent={accent} />;
      break;
    case "knob":
      content = <KnobControl accent={accent} />;
      break;
    case "text":
      content = <TextControl />;
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
    <div className={`group/metacontrol relative ${widthClass} select-none`}>
      {showChrome && <MetaControlHeader label={control.label} />}
      <div className="flex items-center gap-3">{content}</div>
    </div>
  );
}

function MetaControlHeader({ label }: { label: string }) {
  return (
    <div className="nodrag absolute -top-5 left-0 right-0 flex items-center gap-1 opacity-0 transition-opacity duration-150 pointer-events-none group-hover/metacontrol:pointer-events-auto group-hover/metacontrol:opacity-100">
      <button className={META_CONTROL_MENU_BUTTON_CLASSES} type="button">
        <i className="gg-menu" />
      </button>
      <div className="min-w-0 flex-1">
        <SectionTitle title={label} titleProps={META_CONTROL_TITLE_PROPS} />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button className={META_CONTROL_LOCK_BUTTON_CLASSES} type="button">
          <i className="gg-lock-unlock" />
        </button>
        <button className={META_CONTROL_CLOSE_BUTTON_CLASSES} type="button">
          <i className="gg-close" />
        </button>
      </div>
    </div>
  );
}

function ButtonControl() {
  return (
    <div className="flex w-full items-center gap-2">
      <div className="flex h-8 flex-1 items-center justify-center rounded-lg border border-setta-300/70 bg-setta-100 text-xs font-semibold text-setta-700 dark:border-setta-700 dark:bg-setta-850 dark:text-setta-100">
        Fire
      </div>
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-setta-300/70 bg-white text-[10px] font-semibold text-setta-500 dark:border-setta-700 dark:bg-setta-875 dark:text-setta-300">
        &gt;
      </div>
    </div>
  );
}

function SliderControl({ accent }: { accent: string }) {
  const sliderRootClassName =
    "relative flex w-full touch-none select-none items-center data-[orientation='horizontal']:h-5";
  const sliderTrackClassName =
    "relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] dark:bg-setta-700";
  const sliderRangeClassName = `absolute h-full rounded-full ${accent}`;
  const sliderThumbClassName = `${NO_DRAG_CLASS_NAME} block h-3 w-3 cursor-pointer rounded-full border-2 border-setta-300 bg-white hover:bg-setta-100 focus-visible:border-blue-500 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600`;

  return (
    <SliderInput
      value={68}
      min={0}
      max={100}
      step={1}
      onChange={() => null}
      wrapperDivClass={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} flex w-full items-center gap-3`}
      sliderRootClassName={sliderRootClassName}
      sliderTrackClassName={sliderTrackClassName}
      sliderRangeClassName={sliderRangeClassName}
      sliderThumbClassName={sliderThumbClassName}
      textInputClassName="hidden"
    />
  );
}

function KnobControl({ accent }: { accent: string }) {
  return (
    <div className="flex w-full items-center gap-3">
      <div className="relative h-11 w-11">
        <div className="absolute inset-0 rounded-full border border-setta-300/70 bg-setta-100 dark:border-setta-700 dark:bg-setta-850" />
        <div className="absolute inset-1 rounded-full border border-setta-200/70 bg-setta-50 dark:border-setta-700 dark:bg-setta-875" />
        <div className={`absolute left-1/2 top-1 h-2 w-[3px] -translate-x-1/2 rounded-full ${accent}`} />
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

function TextControl() {
  return (
    <StandardSearch
      noLeftElement={true}
      placeholder="type here..."
      inputStyles="flex-grow truncate outline-0 cursor-text rounded-lg border border-setta-300/70 bg-transparent px-3 py-2 text-[11px] font-mono text-setta-600 placeholder:text-setta-300 dark:border-setta-700 dark:text-setta-300 dark:placeholder:text-setta-600"
      outerClasses="flex w-full"
    />
  );
}

function ColorControl() {
  return (
    <ColorPickerInput
      colorChoices={[]}
      value="#38bdf8"
      onChange={() => null}
      wrapperClassName="single-cell-container min-w-0 w-full justify-self-start self-center h-[calc(100%_-_4px)] min-h-0"
      colorPickerChoicesClasses="flex-1 cursor-pointer items-center overflow-hidden rounded-lg single-cell-container colorpicker h-full min-h-0 w-full min-w-0 items-center text-white"
    />
  );
}

function DropzoneControl() {
  return (
    <div className="flex w-full items-center justify-center rounded-xl border border-dashed border-setta-300/80 px-3 py-4 text-[10px] uppercase tracking-[0.2em] text-setta-500 dark:border-setta-700/80 dark:text-setta-400">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-setta-300/70 text-xs font-semibold text-setta-600 dark:border-setta-700 dark:text-setta-300">
          +
        </span>
        Drop file
      </div>
    </div>
  );
}
