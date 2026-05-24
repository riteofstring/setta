import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import _ from "lodash";
import { updateParamImplConfig } from "openapi/http";
import { useEffect, useRef, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useShareCapabilities } from "state/hooks/share";
import {
  ColorPickerConfigForFrontend,
  useParamCodeObjUIConfig,
} from "state/hooks/uiTypes";
import {
  type ColorPickerParamCodeObjImpl,
  CodeObjTypeEnum,
} from "utils/generatedTypes";
import { tryParseJSON } from "utils/utils";
export function ColorPickerInputConfigForParam({
  sectionId,
  paramInfoId,
}: {
  sectionId: string;
  paramInfoId: string;
}) {
  const { canEditStructure } = useShareCapabilities();
  const config = useParamCodeObjUIConfig(
    sectionId,
    paramInfoId,
    CodeObjTypeEnum.ColorPickerParam,
  );
  function onChange(newConfig: ColorPickerConfigForFrontend) {
    if (!canEditStructure) {
      return;
    }
    const configClone = _.cloneDeep(newConfig);
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveCodeObjImplValue<ColorPickerParamCodeObjImpl>(
          state,
          sectionId,
          paramInfoId,
          configClone,
        );
      },
      send: (frontendOpId) =>
        callOpenAPI(
          updateParamImplConfig({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              paramInfoId,
              newConfig: configClone,
              frontendOpId,
            },
          } as Parameters<typeof updateParamImplConfig>[0]),
        ),
    });
  }
  return (
    <ColorPickerInputConfig
      config={config}
      onChange={onChange}
      isDisabled={!canEditStructure}
    />
  );
}
function ColorPickerInputConfig({
  onChange,
  config,
  isDisabled,
}: {
  onChange: (x: ColorPickerConfigForFrontend) => void;
  config: ColorPickerConfigForFrontend;
  isDisabled: boolean;
}) {
  const addColor = () => {
    onChange({
      colorChoices: [
        ...config.colorChoices,
        { color: "#ff0000", description: "" },
      ],
    });
  };
  const removeColor = (removeIdx: number) => {
    onChange({
      colorChoices: config.colorChoices.filter(
        (choice, idx) => idx !== removeIdx,
      ),
    });
  };
  const updateColor = (updateIdx: number, newColor: string) => {
    onChange({
      colorChoices: config.colorChoices.map((choice, idx) =>
        idx === updateIdx
          ? {
              ...choice,
              color: newColor,
            }
          : choice,
      ),
    });
  };
  const updateDescription = (updateIdx: number, description: string) => {
    onChange({
      colorChoices: config.colorChoices.map((choice, idx) =>
        idx === updateIdx ? { ...choice, description } : choice,
      ),
    });
  };
  return (
    <AvailableColors
      colorChoices={config.colorChoices}
      addColor={addColor}
      removeColor={removeColor}
      updateColor={updateColor}
      updateDescription={updateDescription}
      isDisabled={isDisabled}
    />
  );
}
export const AvailableColors = ({
  colorChoices,
  addColor,
  removeColor,
  updateColor,
  updateDescription,
  isDisabled,
}: {
  colorChoices: ColorPickerConfigForFrontend["colorChoices"];
  addColor: () => void;
  removeColor: (removeIdx: number) => void;
  updateColor: (updateIdx: number, newColor: string) => void;
  updateDescription: (updateIdx: number, description: string) => void;
  isDisabled: boolean;
}) => {
  return (
    <>
      <button
        onClick={addColor}
        className="my-1 flex cursor-pointer items-center justify-between rounded-xl bg-setta-100 px-3  py-0.5 uppercase text-setta-500 hover:bg-setta-200 dark:bg-setta-850 dark:text-setta-500 dark:hover:bg-setta-850"
        aria-label="Add color"
        disabled={isDisabled}
      >
        <p className="text-sm font-black ">Add Colors</p>
        <i className="gg-add !scale-90" />
      </button>

      <div className="flex flex-col gap-2 overflow-y-auto">
        {colorChoices.map(({ color, description }, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="flex flex-auto items-center gap-1 overflow-hidden">
              <input
                type="color"
                value={color}
                onChange={(e) => updateColor(idx, e.target.value)}
                className="min-h-6 min-w-6 cursor-pointer rounded-full !border !border-solid !border-setta-500/20 p-0 dark:!border-setta-500/40 [&::-moz-color-swatch]:rounded"
                disabled={isDisabled}
              />
              <input
                type="text"
                value={description}
                onChange={(e) => updateDescription(idx, e.target.value)}
                placeholder="Add description..."
                className="h-[calc(100%_-_2px)] w-[calc(100%_-_2px)] truncate rounded border px-2 py-1 text-xs text-setta-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-setta-400 dark:placeholder-setta-700"
                disabled={isDisabled}
              />
            </div>
            <button
              onClick={() => removeColor(idx)}
              className="flex cursor-pointer items-center rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Remove color"
              disabled={isDisabled}
            >
              <i className="gg-close !scale-75" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
};
export function ColorPickerInput({
  colorChoices,
  value,
  onChange,
  onCommit,
  onEscape,
  wrapperClassName,
  colorPickerChoicesClasses,
  isDisabled = false,
  theme,
}: {
  colorChoices: ColorPickerConfigForFrontend["colorChoices"];
  value: string;
  onChange: (newColor: string) => void;
  onCommit?: (newColor: string) => void;
  onEscape?: () => void;
  wrapperClassName: string;
  colorPickerChoicesClasses: string;
  isDisabled?: boolean;
  theme?: ColorPickerInputTheme;
}) {
  const _value = tryParseJSON(value);
  return (
    <div className={wrapperClassName}>
      <ColorPicker
        colorChoices={colorChoices}
        value={_value}
        onChange={onChange}
        onCommit={onCommit}
        onEscape={onEscape}
        colorPickerChoicesClasses={colorPickerChoicesClasses}
        isDisabled={isDisabled}
        theme={theme}
      />
    </div>
  );
}
type ColorPickerInputTheme = {
  inputBorderClassName?: string;
  triggerBorderClassName?: string;
  menuContentClassName?: string;
  menuItemClassName?: string;
  menuItemTextClassName?: string;
};
type ResolvedColorPickerInputTheme = Required<ColorPickerInputTheme>;
const DEFAULT_COLOR_PICKER_THEME: ResolvedColorPickerInputTheme = {
  inputBorderClassName: "!border-setta-500/20 dark:!border-setta-500/40",
  triggerBorderClassName: "!border-setta-500/20 dark:!border-setta-500/40",
  menuContentClassName:
    "z-50 flex flex-col rounded bg-white p-2 shadow-md dark:bg-setta-800",
  menuItemClassName:
    "flex cursor-pointer items-center rounded px-2 py-1 hover:bg-setta-100 dark:hover:bg-setta-700",
  menuItemTextClassName:
    "max-w-48 truncate text-xs text-setta-500 dark:text-setta-300",
};
type ColorPickerProps = {
  colorChoices: ColorPickerConfigForFrontend["colorChoices"];
  value: string;
  onChange: (newColor: string) => void;
  onCommit?: (newColor: string) => void;
  onEscape?: () => void;
  colorPickerChoicesClasses: string;
  isDisabled: boolean;
  theme?: ColorPickerInputTheme;
};

function resolveThemeClassName(
  themeClassName: string | undefined,
  fallback: string,
): string {
  return themeClassName ?? fallback;
}

function resolveColorPickerTheme(
  theme?: ColorPickerInputTheme,
): ResolvedColorPickerInputTheme {
  return {
    inputBorderClassName: resolveThemeClassName(
      theme?.inputBorderClassName,
      DEFAULT_COLOR_PICKER_THEME.inputBorderClassName,
    ),
    triggerBorderClassName: resolveThemeClassName(
      theme?.triggerBorderClassName,
      DEFAULT_COLOR_PICKER_THEME.triggerBorderClassName,
    ),
    menuContentClassName: resolveThemeClassName(
      theme?.menuContentClassName,
      DEFAULT_COLOR_PICKER_THEME.menuContentClassName,
    ),
    menuItemClassName: resolveThemeClassName(
      theme?.menuItemClassName,
      DEFAULT_COLOR_PICKER_THEME.menuItemClassName,
    ),
    menuItemTextClassName: resolveThemeClassName(
      theme?.menuItemTextClassName,
      DEFAULT_COLOR_PICKER_THEME.menuItemTextClassName,
    ),
  };
}

function resolveSelectedColorChoice(
  colorChoices: ColorPickerConfigForFrontend["colorChoices"],
  color: string,
) {
  return (
    colorChoices.find((choice) => choice.color === color) ?? colorChoices[0]
  );
}

function ColorPickerChoiceOption({
  item,
  isSelected,
  menuItemClassName,
  menuItemTextClassName,
  onSelect,
}: {
  item: ColorPickerConfigForFrontend["colorChoices"][number];
  isSelected: boolean;
  menuItemClassName: string;
  menuItemTextClassName: string;
  onSelect: (color: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      className={menuItemClassName}
      onClick={() => onSelect(item.color)}
    >
      <div
        className="mr-2 h-4 w-4 rounded-full"
        style={{ backgroundColor: item.color }}
      />
      <p className={menuItemTextClassName}>{item.description}</p>
    </button>
  );
}

function ColorPicker({
  colorChoices,
  value,
  onChange,
  onCommit,
  onEscape,
  colorPickerChoicesClasses,
  isDisabled,
  theme,
}: ColorPickerProps) {
  const nativeInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!onCommit) {
      return;
    }
    const input = nativeInputRef.current;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const handleNativeChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      onCommit(target.value);
    };
    input.addEventListener("change", handleNativeChange);
    return () => {
      input.removeEventListener("change", handleNativeChange);
    };
  }, [onCommit]);
  const resolvedTheme = resolveColorPickerTheme(theme);
  const style = {
    // from https://codepen.io/devongovett/pen/QwLbRrW
    "--bg": value,
    background: "var(--bg)",
    color: "lch(from var(--bg) calc((49.44 - l) * infinity) 0 0)",
  };
  return colorChoices?.length > 0 ? (
    <ColorPickerFromColorChoices
      color={value}
      setColor={onChange}
      onCommit={onCommit}
      colorChoices={colorChoices}
      colorPickerChoicesClasses={colorPickerChoicesClasses}
      isDisabled={isDisabled}
      onEscape={onEscape}
      theme={resolvedTheme}
    />
  ) : (
    <>
      <i
        className="gg-color-picker single-cell-child pointer-events-none mr-0.5 mt-0.5 place-self-center"
        style={style}
      />
      {/*
            Keep layout/interaction classes stable and make only the styling pieces overridable.
            App mode uses `theme.*` to be token-driven without perturbing IDE rendering.
          */}
      {(() => {
        return (
          <input
            ref={nativeInputRef}
            id="colorPicker"
            type="color"
            value={value}
            onInput={(e) => onChange((e.target as HTMLInputElement).value)}
            onChange={(e) => {
              const nextColor = (e.target as HTMLInputElement).value;
              if (onCommit) {
                return;
              }
              if (nextColor !== value) {
                onChange(nextColor);
              }
            }}
            className={`single-cell-child flex !h-[calc(100%_-_2px)] min-h-0 !w-[calc(100%_-_2px)] min-w-0 cursor-pointer items-center justify-between overflow-hidden !rounded-lg !border !border-solid ${resolvedTheme.inputBorderClassName}`}
            disabled={isDisabled}
            onKeyDown={(e) => {
              if (e.code === "Escape") {
                onEscape?.();
              }
            }}
          />
        );
      })()}
    </>
  );
}
type ColorPickerFromColorChoicesProps = {
  color: string;
  setColor: (newColor: string) => void;
  onCommit?: (newColor: string) => void;
  colorChoices: ColorPickerConfigForFrontend["colorChoices"];
  colorPickerChoicesClasses: string;
  isDisabled: boolean;
  onEscape?: () => void;
  theme: ResolvedColorPickerInputTheme;
};
function ColorPickerFromColorChoices({
  color,
  setColor,
  onCommit,
  colorChoices,
  colorPickerChoicesClasses,
  isDisabled,
  onEscape,
  theme,
}: ColorPickerFromColorChoicesProps) {
  const selectedItem = resolveSelectedColorChoice(colorChoices, color);
  const style = {
    "--bg": selectedItem.color,
    background: "var(--bg)",
    color: "lch(from var(--bg) calc((49.44 - l) * infinity) 0 0)",
  };
  const [isOpen, setIsOpen] = useState(false);
  const selectColor = (nextColor: string) => {
    setColor(nextColor);
    onCommit?.(nextColor);
    setIsOpen(false);
  };
  return (
    <StandardPopover
      open={isOpen}
      onOpenChange={setIsOpen}
      repositionOnCanvasTransform={true}
      contentClasses={theme.menuContentClassName}
      contentProps={{
        align: "start",
        sideOffset: 6,
        style: { minWidth: "var(--radix-popover-trigger-width)" },
        onEscapeKeyDown: (event) => {
          event.stopPropagation();
          onEscape?.();
        },
      }}
      trigger={
        <button
          type="button"
          className={colorPickerChoicesClasses}
          disabled={isDisabled}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          onKeyDown={(e) => {
            if (e.code === "Escape") {
              // have to stop propagation to prevent section from becoming unselected
              e.stopPropagation();
              onEscape?.();
            }
          }}
        >
          <div
            className={`single-cell-child min-w-0s m-auto h-full min-h-0 w-full rounded-lg !border !border-solid ${theme.triggerBorderClassName}`}
            style={{ backgroundColor: selectedItem.color }}
          />
          <div className="single-cell-child flex items-center justify-between overflow-hidden">
            <p
              className="ml-[2px] truncate pl-2.5 text-xs font-semibold @[90px]:inline-block"
              style={style}
            >
              {selectedItem.description}
            </p>
            <i className="gg-chevron-down px-2" style={style} />
          </div>
        </button>
      }
    >
      <div
        role="listbox"
        aria-label="Available colors"
        className="flex flex-col"
      >
        {colorChoices.map((item, index) => (
          <ColorPickerChoiceOption
            key={index}
            item={item}
            isSelected={item.color === color}
            menuItemClassName={theme.menuItemClassName}
            menuItemTextClassName={theme.menuItemTextClassName}
            onSelect={selectColor}
          />
        ))}
      </div>
    </StandardPopover>
  );
}
