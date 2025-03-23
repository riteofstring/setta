import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { Toggle } from "components/Utils/atoms/toggles/Toggle";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { useEffect, useState } from "react";
import { MODEL_GROUPS } from "utils/constants";

// Local storage key
const STORAGE_KEY = "project-llm-settings";

export function ProjectLLMSettings() {
  // State to hold the list of model items
  const [modelItems, setModelItems] = useState(() => {
    try {
      const savedItems = localStorage.getItem(STORAGE_KEY);
      return savedItems ? JSON.parse(savedItems) : [];
    } catch (error) {
      console.error("Error loading from localStorage:", error);
      return [];
    }
  });

  // Save to localStorage whenever modelItems changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(modelItems));
  }, [modelItems]);

  // Add a new model item
  const addModelItem = () => {
    setModelItems([
      ...modelItems,
      {
        id: Date.now().toString(),
        isLocal: false,
        selectedLLM: null,
        apiKey: "",
        path: "",
      },
    ]);
  };

  // Remove a model item
  const removeModelItem = (id) => {
    setModelItems(modelItems.filter((item) => item.id !== id));
  };

  // Update a model item
  const updateModelItem = (id, updatedData) => {
    setModelItems(
      modelItems.map((item) =>
        item.id === id ? { ...item, ...updatedData } : item,
      ),
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-[30dvh] text-setta-600 dark:text-setta-400">
      {modelItems.map((item) => (
        <ModelItem
          key={item.id}
          item={item}
          onUpdate={(data) => updateModelItem(item.id, data)}
          onRemove={() => removeModelItem(item.id)}
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

function ModelItem({ item, onUpdate, onRemove }) {
  const { isLocal, selectedLLM, apiKey = [], path = "" } = item;

  return (
    <div className="mr-0.5 flex flex-col gap-2 rounded-lg p-3 text-xs transition-colors hover:bg-white/50 hover:dark:bg-setta-800/50">
      <div className="flex items-center gap-2">
        <p className="-ml-2.5 mr-auto w-full min-w-0 max-w-[300px]">
          <IdNameCombobox
            allItems={MODEL_GROUPS}
            value={selectedLLM}
            onSelectedItemChange={(selectedItem) =>
              onUpdate({ selectedLLM: selectedItem })
            }
            placeholder="Select an LLM model."
            small={false}
            type="button"
          />
        </p>
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
        <p className="flex flex-col gap-0.5">
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
        </p>
      )}
    </div>
  );
}
