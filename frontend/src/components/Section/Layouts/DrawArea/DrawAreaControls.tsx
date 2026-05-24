import { arrayMove } from "@dnd-kit/helpers";
import { ColorPickerInput } from "components/Params/ParamUIs/ColorPickerInput";
import { SliderInput } from "components/Params/ParamUIs/SliderInput";
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import _ from "lodash";
import {
  useCallback,
  useEffect,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import { BiHide, BiPaint, BiShow } from "react-icons/bi";
import { BsLayers } from "react-icons/bs";
import { FaPlus } from "react-icons/fa";
import { IoMove } from "react-icons/io5";
import {
  getCurrEffectiveSectionImplOfType,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  DrawAreaBrushShape,
  DrawAreaBrushShapeEnum,
  DrawAreaMode,
  DrawAreaModeEnum,
  SectionTypeEnum,
  createDrawAreaLayer,
} from "utils/generatedTypes";

export function DrawAreaControls({
  sectionId,
  activeLayerIdx,
  brushColor,
  brushOpacity,
  brushSize,
  brushShape,
  eraserBrushSize,
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
  clearStrokes: () => void;
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

      <DrawAreaClearStrokesButton clearStrokes={clearStrokes} />
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

  const [localValue, setLocalValue] = useState(brushColor);

  const debouncedSetBrushColor = useCallback(
    _.debounce((v) => {
      useProjectState.setState((x) => {
        setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
          brushColor: v,
        });
      });
    }, 200),
    [sectionId],
  );

  function onChange(v: string) {
    setLocalValue(v);
    debouncedSetBrushColor(v);
  }

  return (
    <ColorPickerInput
      colorChoices={colorChoices}
      value={localValue}
      onChange={onChange}
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
    useProjectState.setState((x) => {
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        canvasMode: DrawAreaModeEnum.draw,
      });
    });
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
    useProjectState.setState((x) => {
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        brushOpacity: v,
      });
    });
  }

  function setBrushSize(v: number) {
    useProjectState.setState((x) => {
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        brushSize: v,
      });
    });
  }

  function setBrushShape(v: DrawAreaBrushShape) {
    useProjectState.setState((x) => {
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        brushShape: v,
      });
    });
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
    useProjectState.setState((x) => {
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        canvasMode: DrawAreaModeEnum.erase,
      });
    });
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
    useProjectState.setState((x) => {
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        eraserBrushSize: v,
      });
    });
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
    useProjectState.setState((x) => {
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        canvasMode: DrawAreaModeEnum.edit,
      });
    });
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
    useProjectState.setState((x) => {
      setCurrEffectiveSectionImplValue<"DrawSection">(x, sectionId, {
        layers: (currLayers) => {
          if (currLayers[activeLayerIdx]) {
            currLayers[activeLayerIdx].layerOpacity = v;
          }
          return currLayers;
        },
      });
    });
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

type LayerMetadata = {
  index: number;
  name: string;
  visible: boolean;
};

function LayerList({
  sectionId,
  activeLayerIdx,
}: {
  sectionId: string;
  activeLayerIdx: number;
}) {
  function reorderLayers(draggedIdx: number, targetIdx: number) {
    if (draggedIdx === targetIdx) {
      return;
    }
    useProjectState.setState((state) => {
      const impl = getCurrEffectiveSectionImplOfType(
        state,
        sectionId,
        SectionTypeEnum.Draw,
      );
      const nextLayers = arrayMove(impl.layers, draggedIdx, targetIdx);
      const { activeLayerIdx: currentActiveIdx } = impl;

      let nextActiveIdx = currentActiveIdx;
      if (currentActiveIdx === draggedIdx) {
        nextActiveIdx = targetIdx;
      } else if (
        draggedIdx < currentActiveIdx &&
        currentActiveIdx <= targetIdx
      ) {
        nextActiveIdx = currentActiveIdx - 1;
      } else if (
        draggedIdx > currentActiveIdx &&
        currentActiveIdx >= targetIdx
      ) {
        nextActiveIdx = currentActiveIdx + 1;
      }

      setCurrEffectiveSectionImplValue<"DrawSection">(state, sectionId, {
        layers: () => nextLayers,
        activeLayerIdx: () => nextActiveIdx,
      });
    });
  }

  function setLayerVisibility(layerIdx: number, visible: boolean) {
    useProjectState.setState((state) => {
      setCurrEffectiveSectionImplValue<"DrawSection">(state, sectionId, {
        layers: (currLayers) => {
          if (!currLayers[layerIdx]) {
            return currLayers;
          }
          return currLayers.map((layer, idx) =>
            idx === layerIdx ? { ...layer, visible } : layer,
          );
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

  function addLayer() {
    useProjectState.setState((state) => {
      const impl = getCurrEffectiveSectionImplOfType(
        state,
        sectionId,
        SectionTypeEnum.Draw,
      );
      const newLayers = [...impl.layers, createDrawAreaLayer()];
      setCurrEffectiveSectionImplValue<"DrawSection">(state, sectionId, {
        layers: () => newLayers,
        activeLayerIdx: () => newLayers.length - 1,
      });
    });
  }

  function deleteLayer(layerIdx: number) {
    useProjectState.setState((state) => {
      const impl = getCurrEffectiveSectionImplOfType(
        state,
        sectionId,
        SectionTypeEnum.Draw,
      );
      if (!impl.layers[layerIdx]) {
        return;
      }
      if (impl.layers.length <= 1) {
        return;
      }
      const newLayers = impl.layers.filter((_, idx) => idx !== layerIdx);
      const currentActiveIdx = impl.activeLayerIdx;
      let nextActiveIdx = currentActiveIdx;
      if (currentActiveIdx === layerIdx) {
        nextActiveIdx = Math.min(layerIdx, newLayers.length - 1);
      } else if (currentActiveIdx > layerIdx) {
        nextActiveIdx = currentActiveIdx - 1;
      }
      nextActiveIdx = Math.max(0, nextActiveIdx);

      setCurrEffectiveSectionImplValue<"DrawSection">(state, sectionId, {
        layers: () => newLayers,
        activeLayerIdx: () => nextActiveIdx,
      });
    });
  }

  const layers = useProjectState<Array<LayerMetadata>>((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Draw,
    );
    return impl.layers.map((layer, index) => ({
      index,
      name: layer.name,
      visible: layer.visible,
    }));
  }, _.isEqual);
  const reversedLayers = [...layers].reverse();

  const [draggedOverIdx, setDraggedOverIdx] = useState<number | null>(null);

  const handleDragStart = (
    event: DragEvent<HTMLLIElement>,
    layerIndex: number,
  ) => {
    event.dataTransfer.setData("text/plain", String(layerIndex));
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (
    event: DragEvent<HTMLLIElement>,
    layerIndex: number,
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDraggedOverIdx(layerIndex);
  };

  const handleDragLeave = () => {
    setDraggedOverIdx(null);
  };

  const handleDrop = (
    event: DragEvent<HTMLLIElement>,
    targetLayerIndex: number,
  ) => {
    event.preventDefault();
    const draggedLayerIndex = Number(event.dataTransfer.getData("text/plain"));
    setDraggedOverIdx(null);

    if (
      Number.isNaN(draggedLayerIndex) ||
      draggedLayerIndex === targetLayerIndex
    ) {
      return;
    }

    reorderLayers(draggedLayerIndex, targetLayerIndex);
  };

  return (
    <div className="flex w-full max-w-64 flex-col gap-2">
      <ul className="mt-1 flex w-full flex-col gap-2">
        {reversedLayers.map((layer) => (
          <li
            key={`${layer.name}-${layer.index}`}
            draggable={true}
            onDragStart={(event) => handleDragStart(event, layer.index)}
            onDragOver={(event) => handleDragOver(event, layer.index)}
            onDragLeave={handleDragLeave}
            onDrop={(event) => handleDrop(event, layer.index)}
            className={`dark:hover:bg-setta-8509 flex cursor-move items-center justify-between gap-2 rounded-lg  border-2 bg-setta-50 px-2 py-1 hover:bg-setta-100 dark:bg-setta-900 ${
              draggedOverIdx === layer.index
                ? " border-blue-500"
                : "border-transparent"
            } `}
            onClick={() => setActiveLayerIdx(layer.index)}
          >
            <button
              type="button"
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                setLayerVisibility(layer.index, !layer.visible);
              }}
              className="cursor-pointer"
            >
              {layer.visible ? (
                <BiShow className="h-5 w-5 text-blue-500" />
              ) : (
                <BiHide className="h-5 w-5 text-setta-400 dark:text-setta-600" />
              )}
            </button>

            <p
              className={`truncate text-sm font-semibold ${layer.index === activeLayerIdx ? "!text-blue-500" : "text-setta-600 dark:text-setta-400"}`}
            >
              {layer.name}
            </p>

            <button
              type="button"
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                deleteLayer(layer.index);
              }}
              className="flex h-4 w-4 cursor-pointer items-center"
            >
              <i className="gg-close  text-setta-400 hover:!text-red-500 dark:text-setta-700" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={addLayer}
        className="flex max-w-full cursor-pointer items-center justify-center rounded p-2 text-sm text-setta-600 hover:text-blue-500"
      >
        <FaPlus className="mr-2 h-3 w-3" />
        Add Layer
      </button>
    </div>
  );
}

function DrawAreaClearStrokesButton({
  clearStrokes,
}: {
  clearStrokes: () => void;
}) {
  return (
    <button
      className="flex w-8 cursor-pointer items-center justify-center gap-1 self-stretch rounded-lg bg-setta-200/30 py-1 text-xs text-setta-700 hover:bg-red-600 hover:text-white dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-red-800 dark:hover:text-white"
      onClick={clearStrokes}
    >
      <i className="gg-trash" />
    </button>
  );
}
