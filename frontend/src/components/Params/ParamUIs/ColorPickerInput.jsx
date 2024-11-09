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

export function ColorPickerInput({ value, onChange, wrapperClassName }) {
  return (
    <div className={wrapperClassName}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-8 min-w-8 cursor-pointer rounded-full p-0"
      />
    </div>
  );
}
