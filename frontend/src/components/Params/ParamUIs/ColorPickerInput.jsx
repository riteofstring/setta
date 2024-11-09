import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
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
                className="min-h-8 min-w-8 cursor-pointer rounded-full p-0"
              />
              <input
                type="text"
                value={description}
                onChange={(e) => updateDescription(idx, e.target.value)}
                placeholder="Add description..."
                className="m-[2px] w-full truncate rounded border px-2 py-1 text-setta-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-setta-400 dark:placeholder-setta-700"
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
    <CustomColorPicker />
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


export function CustomColorPicker() {
    const [color, setColor] = useState({ r: 75, g: 94, b: 129 });
    const [mode, setMode] = useState("RGB"); // Modes: RGB, HSL, HEX
    const [isPickerVisible, setPickerVisible] = useState(false); // Toggle visibility

    const toHSL = ({ r, g, b }) => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if(max === min) h = s = 0;
        else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch(max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    };

    const toHex = ({ r, g, b }) => 
        `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

    const handleInputChange = (e, key) => {
        const value = parseInt(e.target.value, 10);
        setColor((prev) => ({ ...prev, [key]: value }));
    };

    const renderInputs = () => {
        if (mode === "RGB") {
            return ["r", "g", "b"].map((key) => (
                <div key={key} className="flex flex-col items-center">
                    <label className="uppercase">{key}</label>
                    <input 
                        type="number" 
                        min="0" 
                        max="255" 
                        value={color[key]} 
                        onChange={(e) => handleInputChange(e, key)}
                        className="border w-12 text-center"
                    />
                </div>
            ));
        }
        if (mode === "HSL") {
            const hsl = toHSL(color);
            return ["h", "s", "l"].map((key) => (
                <div key={key} className="flex flex-col items-center">
                    <label className="uppercase">{key}</label>
                    <input 
                        type="number" 
                        min={key === "h" ? 0 : 0} 
                        max={key === "h" ? 360 : 100} 
                        value={hsl[key]} 
                        readOnly
                        className="border w-12 text-center bg-gray-100 cursor-not-allowed"
                    />
                </div>
            ));
        }
        if (mode === "HEX") {
            return (
                <div className="flex flex-col items-center">
                    <label>HEX</label>
                    <input 
                        type="text" 
                        value={toHex(color)} 
                        readOnly 
                        className="border w-24 text-center bg-gray-100 cursor-not-allowed"
                    />
                </div>
            );
        }
    };

    return (
        <div className="relative inline-block">
            <button 
                onClick={() => setPickerVisible(!isPickerVisible)}
                className="px-4 py-2 bg-blue-500 text-white rounded"
            >
                Pick Color
            </button>
            {isPickerVisible && (
                <div 
                    className="absolute mt-2 p-4 bg-white border shadow-lg z-50" 
                    style={{ width: '250px', top: '100%', left: 0 }}
                >
                    <div 
                        className="w-24 h-24 rounded-full border mb-4"
                        style={{ backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})` }}
                    ></div>
                    
                    <div className="flex mt-4 gap-2">
                        {renderInputs()}
                    </div>

                    <div className="mt-4">
                        <button 
                            onClick={() => setMode("RGB")} 
                            className={`mr-2 px-2 py-1 ${mode === "RGB" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
                        >RGB</button>
                        <button 
                            onClick={() => setMode("HSL")} 
                            className={`mr-2 px-2 py-1 ${mode === "HSL" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
                        >HSL</button>
                        <button 
                            onClick={() => setMode("HEX")} 
                            className={`px-2 py-1 ${mode === "HEX" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
                        >HEX</button>
                    </div>
                </div>
            )}
        </div>
    );
}
