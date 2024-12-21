import { ColorPickerInput } from "components/Params/ParamUIs/ColorPickerInput";
import { SliderInput } from "components/Params/ParamUIs/SliderInput";
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import _ from "lodash";
import { useEffect, useState } from "react";
import { BiPaint } from "react-icons/bi";
import { useSectionInfos } from "state/definitions";

export function DrawAreaControls({
  sectionId,
  color,
  setColor,
  brushOpacity,
  setBrushOpacity,
  brushSize,
  setBrushSize,
  brushShape,
  setBrushShape,
  eraserBrushSize,
  setEraserBrushSize,
  isEraser,
  setIsEraser,
  layerOpacity,
  setLayerOpacity,
  clearStrokes,
}) {
  return (
    <div className="section-search section-w-full z-10 flex  flex-wrap items-center gap-2 rounded-xl border-b border-solid border-white px-3 py-3 shadow-sm @container dark:border-setta-700 [&_.colorpicker]:!max-h-6 [&_.colorpicker]:max-w-24 ">
      <DrawAreaColorPicker
        sectionId={sectionId}
        color={color}
        setColor={setColor}
      />
      <div className="flex self-stretch">
        <button
          className={`flex w-8 cursor-pointer items-center justify-center gap-1 rounded-l-lg bg-setta-200/30 py-1 text-xs ${!isEraser ? "text-blue-500" : "text-setta-700 dark:text-setta-400"}  hover:bg-setta-200 dark:bg-setta-800/50  dark:hover:bg-setta-900`}
          onClick={() => {
            setIsEraser(false);
          }}
        >
          <BiPaint />
        </button>
        <StandardPopover
          arrowClasses="fill-white dark:fill-setta-800"
          contentClasses="z-20 bg-white dark:bg-setta-800 flex relative px-2 py-1 rounded-lg min-w-48"
          trigger={
            <button className="flex w-6 cursor-pointer items-center justify-center gap-1 rounded-r-lg border border-setta-300/5 bg-setta-200 py-1  text-xs text-setta-700 hover:bg-setta-200 dark:bg-setta-800  dark:text-setta-400 dark:hover:bg-setta-900">
              <i className="gg-chevron-down" />
            </button>
          }
          header={"Brush Settings"}
        >
          <BrushSettings
            opacity={brushOpacity}
            setOpacity={setBrushOpacity}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            brushShape={brushShape}
            setBrushShape={setBrushShape}
          />
        </StandardPopover>
      </div>
      <div className="flex self-stretch">
        <button
          className={`flex w-8 cursor-pointer  items-center justify-center gap-1 rounded-l-lg bg-setta-200/30 py-1 text-xs ${isEraser ? "text-blue-500" : "text-setta-700 dark:text-setta-400"}  hover:bg-setta-300 dark:bg-setta-800/50  dark:hover:bg-setta-900`}
          onClick={() => {
            setIsEraser(true);
          }}
        >
          <i className="gg-erase" />
        </button>
        <StandardPopover
          arrowClasses="fill-white dark:fill-setta-800"
          contentClasses="z-20 bg-white dark:bg-setta-800 flex relative px-2 py-1 rounded-lg min-w-48"
          trigger={
            <button className="flex w-6 cursor-pointer items-center justify-center gap-1 rounded-r-lg border border-setta-300/5 bg-setta-200 py-1  text-xs text-setta-700 hover:bg-setta-300 dark:bg-setta-800  dark:text-setta-400 dark:hover:bg-setta-900">
              <i className="gg-chevron-down" />
            </button>
          }
          header={"Brush Settings"}
        >
          <EraserSettings
            brushSize={eraserBrushSize}
            setBrushSize={setEraserBrushSize}
          />
        </StandardPopover>
      </div>

      <StandardPopover
        arrowClasses="fill-white dark:fill-setta-800"
        contentClasses="z-20 bg-white dark:bg-setta-800 flex relative px-2 py-1 rounded-lg min-w-48"
        trigger={
          <button className="flex w-12 cursor-pointer items-center justify-center gap-0 self-stretch rounded-lg bg-setta-200/30 py-1 text-xs text-setta-700 hover:bg-setta-200 dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-setta-900">
            <i className="gg-image" />
            <i className="gg-chevron-down" />
          </button>
        }
        header={"Layer Opacity"}
      >
        <LayerSettings opacity={layerOpacity} setOpacity={setLayerOpacity} />
      </StandardPopover>

      <button
        className="flex w-8 cursor-pointer items-center justify-center gap-1 self-stretch rounded-lg bg-setta-200/30 py-1 text-xs text-setta-700 hover:bg-red-600 hover:text-white dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-red-800 dark:hover:text-white"
        onClick={clearStrokes}
      >
        <i className="gg-trash" />
      </button>
    </div>
  );
}

function DrawAreaColorPicker({ sectionId, color, setColor }) {
  const colorChoices = useSectionInfos(
    (x) => x.x[sectionId].canvasSettings?.colorChoices,
    _.isEqual,
  );

  return (
    <ColorPickerInput
      colorChoices={colorChoices}
      value={color}
      onChange={setColor}
      colorPickerChoicesClasses="inline-flex cursor-pointer items-center overflow-hidden rounded-lg single-cell-container h-8 min-h-0 w-full min-w-0 max-w-24 items-center text-white"
      wrapperClassName="single-cell-container justify-self-start self-center min-w-8 max-w-48 h-full"
    />
  );
}

function BrushSettings({
  opacity,
  setOpacity,
  brushSize,
  setBrushSize,
  brushShape,
  setBrushShape,
}) {
  const [localOpacity, setLocalOpacity] = useState(opacity);
  const [localBrushSize, setLocalBrushSize] = useState(brushSize);

  useEffect(() => {
    setLocalOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    setLocalBrushSize(brushSize);
  }, [brushSize]);

  const sliderRootClassName =
    "data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex flex-1 min-w-16 touch-none select-none items-center my-auto data-[orientation='horizontal']:h-5";
  const sliderTrackClassName =
    "relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700";
  const sliderRangeClassName = "absolute h-full rounded-full bg-blue-500";
  const sliderThumbClassName =
    "block h-3 w-3 cursor-pointer rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:bg-setta-100 focus:border-blue-500 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600";
  const textInputClassName =
    "my-auto w-7 rounded-lg border border-solid border-setta-600/10 px-2 py-1 text-center font-mono text-xs text-setta-700 dark:border-setta-600/30 dark:text-setta-400";
  return (
    <div className="grid w-full grid-cols-[1fr,_2fr] gap-2">
      <p className="self-center text-xs font-bold text-setta-600 dark:text-setta-400">
        Opacity
      </p>
      <SliderInput
        sliderRootClassName={sliderRootClassName}
        sliderTrackClassName={sliderTrackClassName}
        sliderRangeClassName={sliderRangeClassName}
        sliderThumbClassName={sliderThumbClassName}
        textInputClassName={textInputClassName}
        wrapperDivClass="flex gap-2"
        min={0.1}
        max={1}
        step={0.1}
        value={localOpacity}
        onChange={setLocalOpacity}
        onCommit={setOpacity}
      />
      <p className="self-center text-xs font-bold text-setta-600 dark:text-setta-400">
        Size
      </p>
      <SliderInput
        sliderRootClassName={sliderRootClassName}
        sliderTrackClassName={sliderTrackClassName}
        sliderRangeClassName={sliderRangeClassName}
        sliderThumbClassName={sliderThumbClassName}
        textInputClassName={textInputClassName}
        wrapperDivClass="flex gap-2"
        min={1}
        max={100}
        step={1}
        value={localBrushSize}
        onChange={setLocalBrushSize}
        onCommit={setBrushSize}
      />
      <p className="self-center text-xs font-bold text-setta-600 dark:text-setta-400">
        Brush Shape
      </p>
      <div className="flex gap-1">
        <button
          className={`flex w-min cursor-pointer gap-2 rounded-lg border-solid ${brushShape === "round" ? "border-setta-300 text-blue-500 dark:border-setta-700" : "border-transparent text-setta-600 dark:text-setta-400"} p-1 text-xs font-bold  hover:bg-setta-200/50  focus-visible:ring-1 dark:hover:bg-setta-900/50`}
          onClick={() => setBrushShape("round")}
        >
          <i className="gg-shape-circle" />
        </button>
        <button
          className={`flex w-min cursor-pointer gap-2 rounded-lg border-solid ${brushShape === "butt" ? "border-setta-300 text-blue-500 dark:border-setta-700" : "border-transparent text-setta-600 dark:text-setta-400"} p-1 text-xs font-bold  hover:bg-setta-200/50   dark:hover:bg-setta-900/50`}
          onClick={() => setBrushShape("butt")}
        >
          <i className="gg-shape-square" />
        </button>
      </div>
    </div>
  );
}

function EraserSettings({ brushSize, setBrushSize }) {
  const [localBrushSize, setLocalBrushSize] = useState(brushSize);

  useEffect(() => {
    setLocalBrushSize(brushSize);
  }, [brushSize]);

  const sliderRootClassName =
    "data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex flex-1 min-w-16 touch-none select-none items-center my-auto data-[orientation='horizontal']:h-5";
  const sliderTrackClassName =
    "relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700";
  const sliderRangeClassName = "absolute h-full rounded-full bg-blue-500";
  const sliderThumbClassName =
    "block h-3 w-3 cursor-pointer rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:bg-setta-100 focus:border-blue-500 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600";
  const textInputClassName =
    "my-auto w-7 rounded-lg border border-solid border-setta-600/10 px-2 py-1 text-center font-mono text-xs text-setta-700 dark:border-setta-600/30 dark:text-setta-400";
  return (
    <div className="grid w-full grid-cols-[1fr,_2fr] gap-2">
      <p className="self-center text-xs font-bold text-setta-600 dark:text-setta-400">
        Size
      </p>
      <SliderInput
        sliderRootClassName={sliderRootClassName}
        sliderTrackClassName={sliderTrackClassName}
        sliderRangeClassName={sliderRangeClassName}
        sliderThumbClassName={sliderThumbClassName}
        textInputClassName={textInputClassName}
        wrapperDivClass="flex gap-2"
        min={1}
        max={100}
        step={1}
        value={localBrushSize}
        onChange={setLocalBrushSize}
        onCommit={setBrushSize}
      />
    </div>
  );
}

function LayerSettings({ opacity, setOpacity }) {
  const [localOpacity, setLocalOpacity] = useState(opacity);

  useEffect(() => {
    setLocalOpacity(opacity);
  }, [opacity]);

  const sliderRootClassName =
    "data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex flex-1 min-w-16 touch-none select-none items-center my-auto data-[orientation='horizontal']:h-5";
  const sliderTrackClassName =
    "relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700";
  const sliderRangeClassName = "absolute h-full rounded-full bg-blue-500";
  const sliderThumbClassName =
    "block h-3 w-3 cursor-pointer rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:bg-setta-100 focus:border-blue-500 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600";
  const textInputClassName =
    "my-auto w-7 rounded-lg border border-solid border-setta-600/10 px-2 py-1 text-center font-mono text-xs text-setta-700 dark:border-setta-600/30 dark:text-setta-400";
  return (
    <div className="grid w-full grid-cols-[1fr,_2fr] gap-2">
      <p className="self-center text-xs font-bold text-setta-600 dark:text-setta-400">
        Layer Opacity
      </p>
      <SliderInput
        sliderRootClassName={sliderRootClassName}
        sliderTrackClassName={sliderTrackClassName}
        sliderRangeClassName={sliderRangeClassName}
        sliderThumbClassName={sliderThumbClassName}
        textInputClassName={textInputClassName}
        wrapperDivClass="flex gap-2"
        min={0.1}
        max={1}
        step={0.1}
        value={localOpacity}
        onChange={setLocalOpacity}
        onCommit={setOpacity}
      />
    </div>
  );
}
