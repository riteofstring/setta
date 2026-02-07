import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import _ from "lodash";
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
import { route_update_param_impl_config } from "utils/generatedEndpoints";
import { CodeObjTypeEnum } from "utils/generatedTypes";
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
        setCurrEffectiveCodeObjImplValue<"ColorPickerParamCodeObj">(
          state,
          sectionId,
          paramInfoId,
          configClone,
        );
      },
      send: (frontendOpId) =>
        route_update_param_impl_config({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          paramInfoId,
          newConfig: configClone,
          frontendOpId,
        }),
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
  onEscape,
  wrapperClassName,
  colorPickerChoicesClasses,
  isDisabled = false,
  theme,
}: {
  colorChoices: ColorPickerConfigForFrontend["colorChoices"];
  value: string;
  onChange: (newColor: string) => void;
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
        onEscape={onEscape}
        colorPickerChoicesClasses={colorPickerChoicesClasses}
        isDisabled={isDisabled}
        theme={theme}
      />
    </div>
  );
}

export type ColorPickerInputTheme = {
  inputBorderClassName?: string;
  triggerBorderClassName?: string;
  menuContentClassName?: string;
  menuItemClassName?: string;
  menuItemTextClassName?: string;
};

function ColorPicker({
  colorChoices,
  value,
  onChange,
  onEscape,
  colorPickerChoicesClasses,
  isDisabled,
  theme,
}) {
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
      colorChoices={colorChoices}
      colorPickerChoicesClasses={colorPickerChoicesClasses}
      isDisabled={isDisabled}
      onEscape={onEscape}
      theme={theme}
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
        const inputBorderClassName =
          theme?.inputBorderClassName ??
          "!border-setta-500/20 dark:!border-setta-500/40";
        return (
          <input
            id="colorPicker"
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`single-cell-child flex !h-[calc(100%_-_2px)] min-h-0 !w-[calc(100%_-_2px)] min-w-0 cursor-pointer items-center justify-between overflow-hidden !rounded-lg !border !border-solid ${inputBorderClassName}`}
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

function ColorPickerFromColorChoices({
  color,
  setColor,
  colorChoices,
  colorPickerChoicesClasses,
  isDisabled,
  onEscape,
  theme,
}) {
  let selectedItem = colorChoices.find((c) => c.color === color);
  if (!selectedItem) {
    selectedItem = colorChoices[0];
  }

  const style = {
    "--bg": selectedItem.color,
    background: "var(--bg)",
    color: "lch(from var(--bg) calc((49.44 - l) * infinity) 0 0)",
  };

  const triggerBorderClassName =
    theme?.triggerBorderClassName ??
    "!border-setta-500/20 dark:!border-setta-500/40";
  const menuContentClassName =
    theme?.menuContentClassName ??
    "z-20 flex flex-col rounded bg-white p-2 shadow-md dark:bg-setta-800";
  const menuItemClassName =
    theme?.menuItemClassName ??
    "flex cursor-pointer items-center rounded px-2 py-1 hover:bg-setta-100 dark:hover:bg-setta-700";
  const menuItemTextClassName =
    theme?.menuItemTextClassName ??
    "max-w-48 truncate text-xs text-setta-500 dark:text-setta-300";

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        className={colorPickerChoicesClasses}
        disabled={isDisabled}
        onKeyDown={(e) => {
          if (e.code === "Escape") {
            // have to stop propagation to prevent section from becoming unselected
            e.stopPropagation();
            onEscape?.();
          }
        }}
      >
        <div
          className={`single-cell-child min-w-0s m-auto h-full min-h-0 w-full rounded-lg !border !border-solid ${triggerBorderClassName}`}
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
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={menuContentClassName}
          align="start"
          style={{ minWidth: "var(--radix-dropdown-menu-trigger-width)" }}
        >
          {colorChoices.map((item, index) => (
            <DropdownMenu.Item
              key={index}
              className={menuItemClassName}
              onSelect={() => setColor(item.color)}
            >
              <div
                className="mr-2 h-4 w-4 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <p className={menuItemTextClassName}>
                {item.description}
              </p>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
