import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Pickr from "@simonwep/pickr";
import { useEffect, useRef } from "react";
import { tryParseJSON } from "utils/utils";
import '@simonwep/pickr/dist/themes/monolith.min.css'; 

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
  const ref = useRef();

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    // const child = document.createElement("div");
    // ref.current.appendChild(child);
    // Simple example, see optional options for more configuration.
    const pickr = Pickr.create({
      el: ref.current,
      theme: "classic", // or 'monolith', or 'nano'

      swatches: [
        "rgba(244, 67, 54, 1)",
        "rgba(233, 30, 99, 0.95)",
        "rgba(156, 39, 176, 0.9)",
        "rgba(103, 58, 183, 0.85)",
        "rgba(63, 81, 181, 0.8)",
        "rgba(33, 150, 243, 0.75)",
        "rgba(3, 169, 244, 0.7)",
        "rgba(0, 188, 212, 0.7)",
        "rgba(0, 150, 136, 0.75)",
        "rgba(76, 175, 80, 0.8)",
        "rgba(139, 195, 74, 0.85)",
        "rgba(205, 220, 57, 0.9)",
        "rgba(255, 235, 59, 0.95)",
        "rgba(255, 193, 7, 1)",
      ],

      components: {
        // Main components
        preview: true,
        opacity: true,
        hue: true,

        // Input / output Options
        interaction: {
          hex: true,
          rgba: true,
          hsla: true,
          hsva: true,
          cmyk: true,
          input: true,
          clear: true,
          save: true,
        },
      },
      useAsButton: true,
    });
    pickr
      .on("init", (instance) => {
        console.log('Event: "init"', instance);
      })
      .on("hide", (instance) => {
        console.log('Event: "hide"', instance);
      })
      .on("show", (color, instance) => {
        console.log('Event: "show"', color, instance);
      })
      .on("save", (color, instance) => {
        console.log('Event: "save"', color, instance);
      })
      .on("clear", (instance) => {
        console.log('Event: "clear"', instance);
      })
      .on("change", (color, source, instance) => {
        console.log('Event: "change"', color, source, instance);
        console.log(color.toHEXA().toString())
        onChange(color.toHEXA().toString())
      })
      .on("changestop", (source, instance) => {
        console.log('Event: "changestop"', source, instance);
      })
      .on("cancel", (instance) => {
        console.log('Event: "cancel"', instance);
      })
      .on("swatchselect", (color, instance) => {
        console.log('Event: "swatchselect"', color, instance);
      });

    return () => {
      pickr.destroyAndRemove();
    };
  }, []);

  return colorChoices?.length > 0 ? (
    <ColorPickerFromColorChoices
      color={value}
      setColor={onChange}
      colorChoices={colorChoices}
    />
  ) : (
    <div
      ref={ref}
      className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-2 transition-shadow duration-200 hover:shadow-md"
    >
      <div
        className="h-6 w-6 rounded-full border border-gray-200"
        style={{ backgroundColor: value }}
      />
      <span className="font-mono text-sm">{value.toUpperCase()}</span>
    </div>
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
