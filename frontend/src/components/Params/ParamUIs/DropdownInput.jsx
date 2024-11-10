import _ from "lodash";
import {
  Button,
  ComboBox,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
} from "react-aria-components";

export function DropdownInputConfig({ onChange, config }) {
  const choices = config.choices ?? [];

  const addChoice = () => {
    const newChoices = [...choices, ""];
    onChange("choices", () => newChoices);
  };

  const removeChoice = (removeIdx) => {
    const newChoices = choices.filter((c, idx) => idx !== removeIdx);
    onChange("choices", () => newChoices);
  };

  const updateChoice = (updateIdx, newChoice) => {
    const newChoices = choices.map((c, idx) =>
      idx === updateIdx ? newChoice : c,
    );
    onChange("choices", () => newChoices);
  };

  return (
    <>
      <button
        onClick={addChoice}
        className="my-1 flex cursor-pointer items-center justify-between rounded-xl border border-solid border-setta-200/70 px-3 py-2 uppercase text-setta-500 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-500 dark:hover:bg-setta-850"
        aria-label="Add choice"
      >
        <p className="text-sm font-black ">Add Choices</p>
        <i className="gg-add !scale-90" />
      </button>

      <div className="flex flex-col gap-2 overflow-y-auto">
        {choices.map((c, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="flex flex-auto items-center gap-1 overflow-hidden">
              <input
                type="text"
                value={c}
                onChange={(e) => updateChoice(idx, e.target.value)}
                placeholder="Add description..."
                className="m-[2px] w-full truncate rounded border px-2 py-1 text-xs text-setta-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-setta-400 dark:placeholder-setta-700"
              />
            </div>
            <button
              onClick={() => removeChoice(idx)}
              className="flex cursor-pointer items-center rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Remove choice"
            >
              <i className="gg-close !scale-75" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export function DropdownInput({ choices, value, onChange, outerDivClasses }) {
  let items = [];

  for (const c of _.uniq(choices)) {
    if (c) {
      items.push({ id: c, name: c });
    }
  }

  function onSelectionChange(newValue) {
    if (choices.includes(newValue)) {
      onChange(newValue);
    }
  }

  return (
    <ComboBox
      defaultItems={items}
      className={outerDivClasses}
      selectedKey={value}
      onSelectionChange={onSelectionChange}
      aria-label="DropdownInput"
      menuTrigger="focus"
      shouldFocusWrap={true}
    >
      <Input className="cursor-text" />
      <Button className="cursor-pointer">▼</Button>
      <Popover>
        <ListBox>
          {(item) => (
            <ListBoxItem
              className={({ isFocused, isSelected }) =>
                `${isSelected ? "bg-red-900" : isFocused ? "bg-green-900" : ""}`
              }
            >
              {item.name}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}
