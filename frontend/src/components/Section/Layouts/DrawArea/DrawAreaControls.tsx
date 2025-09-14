import { ColorPickerInput } from "components/Params/ParamUIs/ColorPickerInput";
import { SliderInput } from "components/Params/ParamUIs/SliderInput";
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import { arrayMove } from "forks/dnd-kit/CustomSortable";
import _ from "lodash";
import { useEffect, useState } from "react";
import { BiHide, BiPaint, BiShow } from "react-icons/bi";
import { BsLayers } from "react-icons/bs";
import { FaPlus } from "react-icons/fa";
import { IoMove } from "react-icons/io5";
import {
  getCurrEffectiveSectionImplOfType,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { getSectionArtifactGroupMetadata } from "state/hooks/artifacts";
import {
  DrawAreaBrushShape,
  DrawAreaBrushShapeEnum,
  DrawAreaMode,
  DrawAreaModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

export function DrawAreaControls({
  sectionId,
  activeLayerIdx,
  brushColor,
  brushOpacity,
  brushSize,
  brushShape,
  eraserBrushSize,
  isEraser,
  setIsEraser,
  layerOpacity,
  canvasMode,
  clearStrokes,
}: {
  sectionId: string;
  activeLayerIdx: number;
  brushColor: string;
  brushOpacity: number;
  brushSize: number;
  brushShape: DrawAreaBrushShape;
  eraserBrushSize: number;
  layerOpacity: number;
  canvasMode: DrawAreaMode;
}) {
  return (
    <div className="section-search section-w-full z-10 flex  flex-wrap items-center gap-2 rounded-xl border-b border-solid border-white px-3 py-3 shadow-sm @container dark:border-setta-700 [&_.colorpicker]:!max-h-6 [&_.colorpicker]:max-w-24 ">
      <DrawAreaColorPicker sectionId={sectionId} brushColor={brushColor} />
      <div className="flex self-stretch">
        <DrawAreaSetToDrawModeButton
          sectionId={sectionId}
          canvasMode={canvasMode}
        />
        <StandardPopover
          arrowClasses="fill-white dark:fill-setta-800"
          contentClasses="z-20 bg-white dark:bg-setta-800 flex relative px-2 py-1 rounded-lg min-w-48"
          trigger={
            <button className="flex w-6 cursor-pointer items-center justify-center gap-1 rounded-r-lg border border-setta-300/5 bg-setta-200 py-1  text-xs text-setta-700 hover:bg-setta-200 dark:bg-setta-800  dark:text-setta-400 dark:hover:bg-setta-900">
              <i className="gg-chevron-down" />
            </button>
          }
        >
          <BrushSettings
            sectionId={sectionId}
            opacity={brushOpacity}
            brushSize={brushSize}
            brushShape={brushShape}
          />
        </StandardPopover>
      </div>
      <div className="flex self-stretch">
        <DrawAreaSetToEraserModeButton
          sectionId={sectionId}
          canvasMode={canvasMode}
        />
        <StandardPopover
          arrowClasses="fill-white dark:fill-setta-800"
          contentClasses="z-20 bg-white dark:bg-setta-800 flex relative px-2 py-1 rounded-lg min-w-48"
          trigger={
            <button className="flex w-6 cursor-pointer items-center justify-center gap-1 rounded-r-lg border border-setta-300/5 bg-setta-200 py-1  text-xs text-setta-700 hover:bg-setta-300 dark:bg-setta-800  dark:text-setta-400 dark:hover:bg-setta-900">
              <i className="gg-chevron-down" />
            </button>
          }
        >
          <EraserSettings
            sectionId={sectionId}
            eraserBrushSize={eraserBrushSize}
          />
        </StandardPopover>
      </div>

      <DrawAreaSetToEditModeButton
        sectionId={sectionId}
        canvasMode={canvasMode}
      />
      <StandardPopover
        arrowClasses="fill-white dark:fill-setta-800"
        contentClasses="z-20 bg-white dark:bg-setta-800 flex relative px-2 py-1 rounded-lg min-w-48"
        trigger={
          <button className="flex w-12 cursor-pointer items-center justify-center gap-0 self-stretch rounded-lg bg-setta-200/30 py-1 text-xs text-setta-700 hover:bg-setta-200 dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-setta-900">
            <i className="gg-image" />
            <i className="gg-chevron-down" />
          </button>
        }
      >
        <LayerSettings
          sectionId={sectionId}
          activeLayerIdx={activeLayerIdx}
          opacity={layerOpacity}
        />
      </StandardPopover>

      <StandardPopover
        arrowClasses="fill-white dark:fill-setta-800"
        contentClasses="z-20 bg-white dark:bg-setta-800 flex relative px-2 py-1 rounded-lg min-w-48"
        trigger={
          <button className="flex w-12 cursor-pointer items-center justify-center gap-0 self-stretch rounded-lg bg-setta-200/30 py-1 text-xs text-setta-700 hover:bg-setta-200 dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-setta-900">
            <BsLayers className="w-5" />
            <i className="gg-chevron-down" />
          </button>
        }
      >
        <LayerList sectionId={sectionId} activeLayerIdx={activeLayerIdx} />
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

function DrawAreaColorPicker({
  sectionId,
  brushColor,
}: {
  sectionId: string;
  brushColor: string;
}) {
  const colorChoices = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Draw,
    );
    return impl.colorChoices;
  }, _.isEqual);

  function setBrushColor(v: string) {
    useProjectState.setState((x) =>
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        brushColor: v,
      }),
    );
  }

  return (
    <ColorPickerInput
      colorChoices={colorChoices}
      value={brushColor}
      onChange={setBrushColor}
      colorPickerChoicesClasses="inline-flex cursor-pointer items-center overflow-hidden rounded-lg single-cell-container h-8 min-h-0 w-full min-w-0 max-w-24 items-center text-white"
      wrapperClassName="single-cell-container justify-self-start self-center min-w-8 max-w-48 h-full"
    />
  );
}

function DrawAreaSetToDrawModeButton({
  sectionId,
  canvasMode,
}: {
  sectionId: string;
  canvasMode: DrawAreaMode;
}) {
  function onClick() {
    useProjectState.setState((x) =>
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        canvasMode: DrawAreaModeEnum.draw,
      }),
    );
  }

  return (
    <button
      className={`flex w-8 cursor-pointer items-center justify-center gap-1 rounded-l-lg bg-setta-200/30 py-1 text-xs ${canvasMode === DrawAreaModeEnum.draw ? "text-blue-500" : "text-setta-700 dark:text-setta-400"}  hover:bg-setta-200 dark:bg-setta-800/50  dark:hover:bg-setta-900`}
      onClick={onClick}
    >
      <BiPaint />
    </button>
  );
}

function BrushSettings({ sectionId, opacity, brushSize, brushShape }) {
  const [localOpacity, setLocalOpacity] = useState(opacity);
  const [localBrushSize, setLocalBrushSize] = useState(brushSize);

  useEffect(() => {
    setLocalOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    setLocalBrushSize(brushSize);
  }, [brushSize]);

  function setBrushOpacity(v: number) {
    useProjectState.setState((x) =>
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        brushOpacity: v,
      }),
    );
  }

  function setBrushSize(v: number) {
    useProjectState.setState((x) =>
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        brushSize: v,
      }),
    );
  }

  function setBrushShape(v: DrawAreaBrushShape) {
    useProjectState.setState((x) =>
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        brushShape: v,
      }),
    );
  }

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
        onCommit={setBrushOpacity}
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
          className={`flex w-min cursor-pointer gap-2 rounded-lg border-solid ${brushShape === DrawAreaBrushShapeEnum.butt ? "border-setta-300 text-blue-500 dark:border-setta-700" : "border-transparent text-setta-600 dark:text-setta-400"} p-1 text-xs font-bold  hover:bg-setta-200/50   dark:hover:bg-setta-900/50`}
          onClick={() => setBrushShape(DrawAreaBrushShapeEnum.butt)}
        >
          <i className="gg-shape-square" />
        </button>
        <button
          className={`flex w-min cursor-pointer gap-2 rounded-lg border-solid ${brushShape === DrawAreaBrushShapeEnum.round ? "border-setta-300 text-blue-500 dark:border-setta-700" : "border-transparent text-setta-600 dark:text-setta-400"} p-1 text-xs font-bold  hover:bg-setta-200/50  focus-visible:ring-1 dark:hover:bg-setta-900/50`}
          onClick={() => setBrushShape(DrawAreaBrushShapeEnum.round)}
        >
          <i className="gg-shape-circle" />
        </button>
      </div>
    </div>
  );
}

function DrawAreaSetToEraserModeButton({
  sectionId,
  canvasMode,
}: {
  sectionId;
  canvasMode: DrawAreaMode;
}) {
  function onClick() {
    useProjectState.setState((x) =>
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        canvasMode: DrawAreaModeEnum.erase,
      }),
    );
  }

  return (
    <button
      className={`flex w-8 cursor-pointer  items-center justify-center gap-1 rounded-l-lg bg-setta-200/30 py-1 text-xs ${canvasMode === DrawAreaModeEnum.erase ? "text-blue-500" : "text-setta-700 dark:text-setta-400"}  hover:bg-setta-300 dark:bg-setta-800/50  dark:hover:bg-setta-900`}
      onClick={onClick}
    >
      <i className="gg-erase" />
    </button>
  );
}

function EraserSettings({ sectionId, eraserBrushSize }) {
  const [localBrushSize, setLocalBrushSize] = useState(eraserBrushSize);

  useEffect(() => {
    setLocalBrushSize(eraserBrushSize);
  }, [eraserBrushSize]);

  function setBrushSize(v: number) {
    useProjectState.setState((x) =>
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        eraserBrushSize: v,
      }),
    );
  }

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

function DrawAreaSetToEditModeButton({
  sectionId,
  canvasMode,
}: {
  sectionId;
  canvasMode: DrawAreaMode;
}) {
  function onClick() {
    useProjectState.setState((x) =>
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        canvasMode: DrawAreaModeEnum.edit,
      }),
    );
  }

  return (
    <button
      className={`flex w-8 cursor-pointer items-center justify-center gap-1 self-stretch rounded-lg bg-setta-200/30 py-1 text-xs ${canvasMode === DrawAreaModeEnum.edit ? "text-blue-500" : "text-setta-700 dark:text-setta-400"}  hover:bg-setta-300 dark:bg-setta-800/50  dark:hover:bg-setta-900`}
      onClick={onClick}
    >
      <IoMove />
    </button>
  );
}

function LayerSettings({ sectionId, activeLayerIdx, opacity }) {
  const [localOpacity, setLocalOpacity] = useState(opacity);

  useEffect(() => {
    setLocalOpacity(opacity);
  }, [opacity]);

  function setOpacity(v: number) {
    useProjectState.setState((x) =>
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        layers: (currLayers) => {
          if (currLayers[activeLayerIdx]) {
            currLayers[activeLayerIdx].layerOpacity = v;
          }
          return currLayers;
        },
      }),
    );
  }

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

function LayerList({ sectionId, activeLayerIdx }) {
  function reorderLayers(draggedIdx: number, targetIdx: number) {
    useProjectState.setState((state) => {
      setCurrEffectiveSectionImplValue<"DrawSection">(state, sectionId, {
        layers: (currLayers) => arrayMove(currLayers, draggedIdx, targetIdx),
      });
    });
  }

  function setLayerVisibility(layerIdx: number, visible: boolean) {
    useProjectState.setState((state) => {
      setCurrEffectiveSectionImplValue<"DrawSection">(state, sectionId, {
        layers: (currLayers) => {
          if (currLayers[layerIdx]) {
            currLayers[layerIdx].visible = visible;
          }
          return currLayers;
        },
      });
    });
  }

  function setActiveLayerIdx(layerIdx: number) {
    useProjectState.setState((state) => {
      setCurrEffectiveSectionImplValue<"DrawSection">(state, sectionId, {
        activeLayerIdx: layerIdx,
      });
    });
  }

  function addLayer() {}

  function deleteLayer() {}

  const layers = useProjectState(
    (x) => getSectionArtifactGroupMetadata(sectionId, x),
    _.isEqual,
  );
  const reversedLayers = layers.toReversed();

  const [draggedOverIdx, setDraggedOverIdx] = useState(null);

  const handleDragStart = (e, idx) => {
    e.dataTransfer.setData("text/plain", idx);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    setDraggedOverIdx(idx);
  };

  const handleDragLeave = () => {
    setDraggedOverIdx(null);
  };

  const handleDrop = (e, targetIdx) => {
    e.preventDefault();
    const draggedIdx = e.dataTransfer.getData("text/plain");
    setDraggedOverIdx(null);

    if (draggedIdx !== targetIdx) {
      // layers are reversed, so adjust indices
      reorderLayers(
        layers.length - 1 - draggedIdx,
        layers.length - 1 - targetIdx,
      );
    }
  };

  return (
    <div className="flex w-full max-w-64 flex-col gap-2">
      <ul className="mt-1 flex w-full flex-col gap-2">
        {reversedLayers.map((layer, idx) => (
          <li
            key={layer.id}
            draggable={true}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, idx)}
            className={`dark:hover:bg-setta-8509 flex cursor-move items-center justify-between gap-2 rounded-lg  border-2 bg-setta-50 px-2 py-1 hover:bg-setta-100 dark:bg-setta-900 ${
              draggedOverIdx === idx ? " border-blue-500" : "border-transparent"
            } `}
            onClick={() => setActiveLayerIdx(layer.id)}
          >
            <button
              onClick={() => setLayerVisibility(layer.id, !layer.visible)}
              className="cursor-pointer"
            >
              {layer.visible ? (
                <BiShow className="h-5 w-5 text-blue-500" />
              ) : (
                <BiHide className="h-5 w-5 text-setta-400 dark:text-setta-600" />
              )}
            </button>

            <p
              className={`truncate text-sm font-semibold ${activeLayerId === layer.id ? " !text-blue-500" : "text-setta-600 dark:text-setta-400"}`}
            >
              {layer.name}
            </p>

            <button
              onClick={() => deleteLayer(layer.id)}
              className="flex h-4 w-4 cursor-pointer items-center"
            >
              <i className="gg-close  text-setta-400 hover:!text-red-500 dark:text-setta-700" />
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={addLayer}
        className="flex max-w-full cursor-pointer items-center justify-center rounded p-2 text-sm text-setta-600 hover:text-blue-500"
      >
        <FaPlus className="mr-2 h-3 w-3" />
        Add Layer
      </button>
    </div>
  );
}
