import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { Toggle } from "components/Utils/atoms/toggles/Toggle";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { useState } from "react";
import { localStorageFns } from "state/hooks/localStorage";
import { MODEL_GROUPS } from "utils/constants";

export function ProjectLLMSettings() {
  const [modelItems, setModelItems] = localStorageFns.modelItems.hook();
  const [itemOrder, setItemOrder] = useState({});

  const addModelItem = (groupName, modelItem) => {
    setModelItems((prev) => {
      const newSelected = [...prev];
      const existingGroupIndex = newSelected.findIndex(
        (group) => group.group === groupName,
      );

      if (existingGroupIndex >= 0) {
        const existingItemIndex = newSelected[
          existingGroupIndex
        ].items.findIndex((item) => item.uniqueId === modelItem.uniqueId);

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

  const removeModelItem = (groupName, uniqueId) => {
    setModelItems((prevSelected) => {
      const newSelected = [...prevSelected];

      const groupIndex = newSelected.findIndex(
        (group) => group.group === groupName,
      );
      if (groupIndex >= 0) {
        newSelected[groupIndex].items = newSelected[groupIndex].items.filter(
          (item) => item.uniqueId !== uniqueId,
        );

        if (newSelected[groupIndex].items.length === 0) {
          newSelected.splice(groupIndex, 1);
        }
      }

      return newSelected;
    });
  };

  const handleAddLLM = () => {
    const unassignedGroup =
      MODEL_GROUPS.find((g) => g.group === "Unassigned Models")?.group ||
      "Unassigned Models";

    const newUniqueId = crypto.randomUUID();

    // Update the order tracker
    setItemOrder((prev) => ({
      ...prev,
      [newUniqueId]: Date.now(), // Use timestamp as sort order
    }));

    const defaultModel = {
      uniqueId: newUniqueId,
      id: "",
      name: "",
      isLocal: false,
      apiKey: [],
      path: "",
    };

    addModelItem(unassignedGroup, defaultModel);
  };

  // In ProjectLLMSettings
  const updateModelItem = (groupName, uniqueId, updates) => {
    setModelItems((prevSelected) => {
      const newSelected = [...prevSelected];
      const groupIndex = newSelected.findIndex(
        (group) => group.group === groupName,
      );

      if (groupIndex >= 0) {
        const itemIndex = newSelected[groupIndex].items.findIndex(
          (item) => item.uniqueId === uniqueId,
        );

        if (itemIndex >= 0) {
          newSelected[groupIndex].items[itemIndex] = {
            ...newSelected[groupIndex].items[itemIndex],
            ...updates,
          };
        }
      }

      return newSelected;
    });
  };

  const moveModelItem = (
    fromGroupName,
    toGroupName,
    uniqueId,
    updatedModel,
  ) => {
    setModelItems((prevItems) => {
      // Create a deep copy of the existing items
      const newItems = JSON.parse(JSON.stringify(prevItems));

      const fromGroupIndex = newItems.findIndex(
        (group) => group.group === fromGroupName,
      );

      let modelToMove = null;

      if (fromGroupIndex >= 0) {
        const itemIndex = newItems[fromGroupIndex].items.findIndex(
          (item) => item.uniqueId === uniqueId,
        );

        if (itemIndex >= 0) {
          modelToMove = {
            ...newItems[fromGroupIndex].items[itemIndex],
            ...updatedModel,
          };
          newItems[fromGroupIndex].items.splice(itemIndex, 1);

          if (newItems[fromGroupIndex].items.length === 0) {
            newItems.splice(fromGroupIndex, 1);
          }
        }
      }

      if (modelToMove) {
        const toGroupIndex = newItems.findIndex(
          (group) => group.group === toGroupName,
        );

        if (toGroupIndex >= 0) {
          newItems[toGroupIndex].items.push(modelToMove);
        } else {
          newItems.push({
            group: toGroupName,
            items: [modelToMove],
          });
        }
      }

      return newItems;
    });
  };

  const allItems = modelItems
    .flatMap((group) =>
      group.items.map((item) => ({ ...item, groupName: group.group })),
    )
    // Sort by the stored order, falling back to uniqueId if no order exists
    .sort((a, b) => {
      const orderA = itemOrder[a.uniqueId] || 0;
      const orderB = itemOrder[b.uniqueId] || 0;
      if (orderA === orderB) {
        // Secondary sort by uniqueId for stability
        return a.uniqueId.localeCompare(b.uniqueId);
      }
      return orderA - orderB;
    });

  console.log("allItems", allItems);
  console.log("modelItems", modelItems);

  return (
    <>
      <button
        onClick={handleAddLLM}
        className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-solid border-setta-500/30 px-3 py-1.5 text-xs font-bold uppercase text-setta-700 hover:bg-white focus-visible:border-blue-500 dark:text-setta-400 dark:hover:bg-setta-800"
      >
        <i className="gg-play-list-add !scale-75" />
        <p>Add an LLM</p>
      </button>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-[30dvh] text-setta-600 dark:text-setta-400">
        {allItems.map((item) => (
          <ModelItem
            key={item.uniqueId}
            item={item}
            onUpdate={(updates) =>
              updateModelItem(item.groupName, item.uniqueId, updates)
            }
            onRemove={() => removeModelItem(item.groupName, item.uniqueId)}
            addModel={(selectedItem, groupName = item.groupName) =>
              addModelItem(groupName, selectedItem)
            }
            moveModel={(fromGroup, toGroup, itemId, updates) =>
              moveModelItem(fromGroup, toGroup, itemId, updates)
            }
          />
        ))}
      </div>
    </>
  );
}

function ModelItem({ item, onUpdate, onRemove, addModel, moveModel }) {
  const {
    isLocal,
    id,
    name,
    apiKey = [],
    path = "",
    groupName,
    uniqueId,
  } = item;

  const handleModelSelect = (selectedModelId) => {
    if (typeof selectedModelId === "string") {
      let selectedModel = null;
      let correctGroupName = "";

      for (const group of MODEL_GROUPS) {
        if (group.items) {
          const foundModel = group.items.find(
            (model) => model.id === selectedModelId,
          );
          if (foundModel) {
            selectedModel = foundModel;
            correctGroupName = group.group || group.name;
            break;
          }
        }
      }

      if (selectedModel) {
        onUpdate({
          id: selectedModelId,
          name: selectedModel.name,
        });
        if (groupName !== correctGroupName) {
          moveModel(groupName, correctGroupName, uniqueId, {
            id: selectedModelId,
            name: selectedModel.name,
          });
        }
      }
    }
  };

  return (
    <div className="mr-0.5 flex flex-col gap-2 rounded-lg p-3 text-xs transition-colors hover:bg-white/50 hover:dark:bg-setta-800/50">
      <div className="flex items-center gap-2">
        <div className="-ml-2.5 mr-auto w-full min-w-0 max-w-[300px]">
          <IdNameCombobox
            allItems={MODEL_GROUPS}
            value={id}
            onSelectedItemChange={handleModelSelect}
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
