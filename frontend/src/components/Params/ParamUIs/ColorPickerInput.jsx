import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { tryParseJSON } from "utils/utils";

export function ColorPickerInputConfig({ onChange, config }) {
  const colors = config.colorChoices ?? [];

  const addColor = () => {
    const colorChoices = [...colors, { color: "#000000", description: "" }];
    onChange("colorChoices", () => colorChoices);
  };

  const removeColor = (removeIdx) => {
    const colorChoices = colors.filter((color, idx) => idx !== removeIdx);
    onChange("colorChoices", () => colorChoices);
  };

  const updateColor = (updateIdx, newColor) => {
    const colorChoices = colors.map((color, idx) =>
      idx === updateIdx ? { ...color, color: newColor } : color,
    );
    onChange("colorChoices", () => colorChoices);
  };

  const updateDescription = (updateIdx, description) => {
    const colorChoices = colors.map((color, idx) =>
      idx === updateIdx ? { ...color, description } : color,
    );
    onChange("colorChoices", () => colorChoices);
  };

  return (
    <AvailableColors
      colors={colors}
      addColor={addColor}
      removeColor={removeColor}
      updateColor={updateColor}
      updateDescription={updateDescription}
    />
  );
}

export const AvailableColors = ({
  colors,
  addColor,
  removeColor,
  updateColor,
  updateDescription,
}) => {
  return (
    <>
      <button
        onClick={addColor}
        className="my-1 flex cursor-pointer items-center justify-between rounded-xl border border-solid border-setta-200/70 px-3 py-2 uppercase text-setta-500 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-500 dark:hover:bg-setta-850"
        aria-label="Add color"
      >
        <p className="text-sm font-black ">Add Colors</p>
        <i className="gg-add !scale-90" />
      </button>

      <div className="flex flex-col gap-2 overflow-y-auto">
        {colors.map(({ color, description }, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="flex flex-auto items-center gap-1 overflow-hidden">
              <input
                type="color"
                value={color}
                onChange={(e) => updateColor(idx, e.target.value)}
                className="min-h-6 min-w-6 cursor-pointer rounded-full !border !border-solid !border-setta-500/20 p-0 [&::-moz-color-swatch]:rounded 
                [&::-moz-color-swatch]:border-0 
                dark:[&::-moz-color-swatch]:border-white/10 
                [&::-webkit-color-swatch-wrapper]:p-0
                [&::-webkit-color-swatch]:rounded 
                [&::-webkit-color-swatch]:border-0
                dark:[&::-webkit-color-swatch]:border-white/10"
              />
              <input
                type="text"
                value={description}
                onChange={(e) => updateDescription(idx, e.target.value)}
                placeholder="Add description..."
                className="m-[2px] w-full truncate rounded border px-2 py-1 text-xs text-setta-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-setta-400 dark:placeholder-setta-700"
              />
            </div>
            <button
              onClick={() => removeColor(idx)}
              className="flex cursor-pointer items-center rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Remove color"
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
  wrapperClassName,
}) {
  const _value = tryParseJSON(value);
  return wrapperClassName ? (
    <div className={wrapperClassName}>
      <ColorPicker
        colorChoices={colorChoices}
        value={_value}
        onChange={onChange}
      />
    </div>
  ) : (
    <ColorPicker
      colorChoices={colorChoices}
      value={_value}
      onChange={onChange}
    />
  );
}

function ColorPicker({ colorChoices, value, onChange }) {
  return colorChoices?.length > 0 ? (
    <ColorPickerFromColorChoices
      color={value}
      setColor={onChange}
      colorChoices={colorChoices}
    />
  ) : (
    <input
      id="colorPicker"
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-h-4 max-w-4 cursor-pointer !border !border-solid !border-setta-500/20"
    />
  );
}

function ColorPickerFromColorChoices({ color, setColor, colorChoices }) {
  let selectedItem = colorChoices.find((c) => c.color === color);
  if (!selectedItem) {
    selectedItem = colorChoices[0];
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="inline-flex cursor-pointer items-center overflow-hidden rounded-lg bg-setta-100 px-2 py-1 dark:bg-setta-850 dark:hover:bg-setta-900">
        <div className="flex items-center text-setta-500 dark:text-setta-400">
          <div
            className="mr-2 h-4 w-4 rounded-full"
            style={{ backgroundColor: selectedItem.color }}
          />
          <p className="max-w-24 truncate text-xs font-black">
            {selectedItem.description}
          </p>
          <i className="gg-chevron-down -mr-1 self-end" />
        </div>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="flex flex-col rounded bg-white p-2 shadow-md dark:bg-setta-800">
        {colorChoices.map((item, index) => (
          <DropdownMenu.Item
            key={index}
            className="flex cursor-pointer items-center rounded px-2 py-1 hover:bg-setta-100 dark:hover:bg-setta-700"
            onSelect={() => setColor(item.color)}
          >
            <div
              className="mr-2 h-4 w-4 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <p className="max-w-48 truncate text-xs text-setta-500 dark:text-setta-300">
              {item.description}
            </p>
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
