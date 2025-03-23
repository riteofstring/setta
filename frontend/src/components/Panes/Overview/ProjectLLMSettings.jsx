import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { Toggle } from "components/Utils/atoms/toggles/Toggle";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { localStorageFns } from "state/hooks/localStorage";
import { MODEL_GROUPS } from "utils/constants";

export function ProjectLLMSettings() {
  const [modelItems, setModelItems] = localStorageFns.modelItems.hook();

  const addModelItem = (groupName, modelItem) => {
    setModelItems((prev) => {
      // Create a copy of the current selection
      const newSelected = [...prev];
      const existingGroupIndex = newSelected.findIndex(
        (group) => group.group === groupName,
      );

      if (existingGroupIndex >= 0) {
        const existingItemIndex = newSelected[
          existingGroupIndex
        ].items.findIndex((item) => item.id === modelItem.id);

        if (existingItemIndex === -1) {
          newSelected[existingGroupIndex].items.push({ ...modelItem });
        } else {
          return newSelected;
        }
      } else {
        newSelected.push({
          group: groupName,
          items: [{ ...modelItem }],
        });
      }

      return newSelected;
    });
  };

  const removeModelItem = (groupName, modelId) => {
    setModelItems((prevSelected) => {
      const newSelected = [...prevSelected];

      // Find the group
      const groupIndex = newSelected.findIndex(
        (group) => group.group === groupName,
      );
      if (groupIndex >= 0) {
        // Remove the item
        newSelected[groupIndex].items = newSelected[groupIndex].items.filter(
          (item) => item.id !== modelId,
        );

        // If the group is now empty, remove the group
        if (newSelected[groupIndex].items.length === 0) {
          newSelected.splice(groupIndex, 1);
        }
      }

      return newSelected;
    });
  };

  // Flatten all items for display while preserving group information
  const allItems = modelItems.flatMap((group) =>
    group.items.map((item) => ({ ...item, groupName: group.group })),
  );

  console.log("allItems", allItems);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-[30dvh] text-setta-600 dark:text-setta-400">
      {allItems.map((item) => (
        <ModelItem
          key={item.id}
          item={item}
          onUpdate={() => {}}
          onRemove={() => removeModelItem(item.groupName, item.id)}
          addModel={(selectedItem) =>
            addModelItem(item.groupName, selectedItem)
          }
        />
      ))}

      <button
        onClick={addModelItem}
        className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-solid border-setta-500/30 px-3 py-1.5 text-xs font-bold uppercase text-setta-700 hover:bg-white focus-visible:border-blue-500 dark:text-setta-400 dark:hover:bg-setta-800"
      >
        <i className="gg-play-list-add !scale-75" />
        <p>Add an LLM</p>
      </button>
    </div>
  );
}

function ModelItem({ item, onUpdate, onRemove, addModel }) {
  const { isLocal, selectedLLM, apiKey = [], path = "" } = item;

  return (
    <div className="mr-0.5 flex flex-col gap-2 rounded-lg p-3 text-xs transition-colors hover:bg-white/50 hover:dark:bg-setta-800/50">
      <div className="flex items-center gap-2">
        <div className="-ml-2.5 mr-auto w-full min-w-0 max-w-[300px]">
          <IdNameCombobox
            allItems={MODEL_GROUPS}
            value={selectedLLM}
            onSelectedItemChange={addModel}
            placeholder="Select an LLM model."
            small={false}
          />
        </div>
        <p>Local</p>
        <Toggle onClick={() => onUpdate({ isLocal: !isLocal })} />
        <IconButton
          icon={<i className="gg-close !scale-75" />}
          color="text-setta-600 hover:text-white"
          bg="bg-transparent hover:bg-red-500"
          size="min-w-4 h-4"
          padding="p-1"
          twClasses=""
          onClick={(e) => {
            e.preventDefault();
            onRemove();
          }}
        />
      </div>

      {isLocal ? (
        <p className="flex flex-col gap-0.5">
          <label htmlFor="Model Location">Path</label>
          <input
            className="border-solid border-x-transparent border-b-setta-200/50 border-t-transparent bg-transparent placeholder-setta-200 focus-visible:!border-b-blue-400 dark:border-b-setta-600/30 dark:placeholder-setta-600"
            name="Model Location"
            placeholder="path"
            value={path}
            onChange={(e) => onUpdate({ path: e.target.value })}
          ></input>
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          <label htmlFor="API Key">API Key</label>
          <div className="single-cell-container min-h-[19px]">
            <PasswordInput
              className={`nodrag single-cell-child peer/textinput flex w-full min-w-0 max-w-[calc(100%_-_1.1rem)] self-center justify-self-start font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]`}
              value={apiKey}
              onChange={(newValue) => onUpdate({ apiKey: newValue })}
              onEscape={() => {}}
              isDisabled={false}
              gridArea="single-cell-child"
            />
            <span
              className={`single-cell-child border-box self-end border-b border-setta-200/50 peer-focus-within/textinput:border-blue-400 dark:border-setta-600/30`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
