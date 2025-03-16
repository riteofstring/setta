import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

export function AddModelModal({ open }) {
  const [modelName, setModelName] = useState("");
  const [modelId, setModelId] = useState("");

  const handleAddModel = () => {
    // Here you would implement the logic to add the new model
    console.log("Adding new model:", { modelName, modelId });

    // Close the modal after adding
    // This would be replaced with your actual logic
  };

  return (
    <div className="flex h-full w-full flex-col">
      <Dialog.Title className="m-0 text-lg font-medium text-setta-800 dark:text-white">
        Add AI Model
      </Dialog.Title>
      <Dialog.Description className="mb-5 mt-2 text-sm text-setta-600 dark:text-setta-400">
        Add a new AI model to use in your chat conversations.
      </Dialog.Description>

      <div className="mb-4">
        <label
          htmlFor="model-name"
          className="block text-sm font-medium text-setta-700 dark:text-setta-300"
        >
          Model Name
        </label>
        <input
          id="model-name"
          type="text"
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-setta-300 bg-white px-3 py-2 text-sm text-setta-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-setta-600 dark:bg-setta-700 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-400"
          placeholder="e.g. GPT-4 Turbo"
        />
      </div>

      <div className="mb-6">
        <label
          htmlFor="model-id"
          className="block text-sm font-medium text-setta-700 dark:text-setta-300"
        >
          Model ID
        </label>
        <input
          id="model-id"
          type="text"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-setta-300 bg-white px-3 py-2 text-sm text-setta-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-setta-600 dark:bg-setta-700 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-400"
          placeholder="e.g. gpt-4-turbo"
        />
      </div>

      <div className="mt-auto flex justify-end space-x-2">
        <Dialog.Close asChild>
          <button className="inline-flex h-9 items-center justify-center rounded-md border border-setta-300 bg-white px-4 text-sm font-medium text-setta-700 shadow-sm hover:bg-setta-100 focus:outline-none focus:ring-2 focus:ring-setta-400 focus:ring-offset-2 dark:border-setta-600 dark:bg-setta-700 dark:text-setta-100 dark:hover:bg-setta-600">
            Cancel
          </button>
        </Dialog.Close>
        <button
          onClick={handleAddModel}
          disabled={!modelName || !modelId}
          className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600"
        >
          Add Model
        </button>
      </div>
    </div>
  );
}
