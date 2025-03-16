import * as Select from "@radix-ui/react-select";
import { useState } from "react";
import {
  IoAddCircleOutline,
  IoCheckmark,
  IoChevronDown,
  IoChevronUp,
} from "react-icons/io5";
import { openAddAIModelModal } from "../../../state/actions/modal";

/**
 * AIModelSelect component for AI model selection dropdown
 * Allows users to choose between different AI models for chat
 */
export const AIModelSelect = () => {
  const [selectedModel, setSelectedModel] = useState("gpt-4");
  const [open, setOpen] = useState(false);

  const handleValueChange = (value) => {
    if (value === "add-model") {
      // Open the modal for adding a new model
      openAddAIModelModal();
      // Keep the previous selection
      return;
    }

    // Set the selected model
    setSelectedModel(value);
  };

  // Get the selected model display name
  const getModelDisplayName = (value) => {
    switch (value) {
      case "gpt-4":
        return "GPT-4";
      case "claude-3-opus":
        return "Claude Opus 3.5";
      case "mixtral":
        return "Mixtral";
      default:
        return "Select a model";
    }
  };

  return (
    <Select.Root
      value={selectedModel}
      onValueChange={handleValueChange}
      open={open}
      onOpenChange={setOpen}
    >
      <Select.Trigger
        className="inline-flex h-8 items-center justify-between gap-1 rounded-full border border-solid border-setta-100 bg-white px-3 py-1 font-mono text-xs font-medium leading-none text-setta-600 outline-none hover:bg-setta-50 focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-300 dark:hover:bg-setta-800"
        aria-label="AI Model"
      >
        <Select.Value>{getModelDisplayName(selectedModel)}</Select.Value>
        <Select.Icon className="ml-1 flex items-center text-setta-400">
          {open ? (
            <IoChevronUp className="h-3 w-3" />
          ) : (
            <IoChevronDown className="h-3 w-3" />
          )}
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className="z-[9999] select-none overflow-hidden rounded-md border border-setta-200 bg-white shadow-xl dark:border-setta-700/70 dark:bg-setta-800 dark:text-setta-200 dark:shadow-setta-900/50"
          position="popper"
          sideOffset={5}
          align="end"
        >
          <Select.ScrollUpButton className="flex h-6 items-center justify-center bg-white text-setta-500 dark:bg-setta-800 dark:text-setta-400">
            <IoChevronUp className="h-3 w-3" />
          </Select.ScrollUpButton>

          <Select.Viewport className="p-1">
            <div className="mx-3 mb-1 truncate border-b border-solid border-setta-300/50 pt-2 text-[0.6rem] font-bold uppercase text-setta-400">
              AI Models
            </div>

            <Select.Group>
              <Select.Item
                value="gpt-4"
                className="mx-1 cursor-pointer select-none truncate rounded-lg px-2 py-[.125rem] text-xs data-[highlighted]:bg-setta-300/50 dark:data-[highlighted]:bg-setta-900/50"
              >
                <div className="flex items-center justify-between">
                  <Select.ItemText>GPT-4</Select.ItemText>
                  <Select.ItemIndicator className="ml-2">
                    <IoCheckmark className="h-3 w-3 text-setta-500" />
                  </Select.ItemIndicator>
                </div>
              </Select.Item>

              <Select.Item
                value="claude-3-opus"
                className="mx-1 cursor-pointer select-none truncate rounded-lg px-2 py-[.125rem] text-xs data-[highlighted]:bg-setta-300/50 dark:data-[highlighted]:bg-setta-900/50"
              >
                <div className="flex items-center justify-between">
                  <Select.ItemText>Claude Opus 3.5</Select.ItemText>
                  <Select.ItemIndicator className="ml-2">
                    <IoCheckmark className="h-3 w-3 text-setta-500" />
                  </Select.ItemIndicator>
                </div>
              </Select.Item>

              <Select.Item
                value="mixtral"
                className="mx-1 cursor-pointer select-none truncate rounded-lg px-2 py-[.125rem] text-xs data-[highlighted]:bg-setta-300/50 dark:data-[highlighted]:bg-setta-900/50"
              >
                <div className="flex items-center justify-between">
                  <Select.ItemText>Mixtral</Select.ItemText>
                  <Select.ItemIndicator className="ml-2">
                    <IoCheckmark className="h-3 w-3 text-setta-500" />
                  </Select.ItemIndicator>
                </div>
              </Select.Item>
            </Select.Group>

            <Select.Separator className="my-1 h-px bg-setta-200 dark:bg-setta-700" />

            <div className="mx-3 mb-1 truncate border-b border-solid border-setta-300/50 pt-1 text-[0.6rem] font-bold uppercase text-setta-400">
              Actions
            </div>

            <Select.Group>
              <Select.Item
                value="add-model"
                className="mx-1 cursor-pointer select-none truncate rounded-lg px-2 py-[.125rem] text-xs text-blue-600 data-[highlighted]:bg-setta-300/50 dark:text-blue-400 dark:data-[highlighted]:bg-setta-900/50"
              >
                <div className="flex items-center gap-1.5">
                  <IoAddCircleOutline className="h-3 w-3" />
                  <Select.ItemText>Add a model</Select.ItemText>
                </div>
              </Select.Item>
            </Select.Group>
          </Select.Viewport>

          <Select.ScrollDownButton className="flex h-6 items-center justify-center bg-white text-setta-500 dark:bg-setta-800 dark:text-setta-400">
            <IoChevronDown className="h-3 w-3" />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
};

export default AIModelSelect;
