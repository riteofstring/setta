import { useEffect, useState } from "react";
import { MdAdd } from "react-icons/md";
import ModelItem from "./ModelItem"; // Import the Radix-enhanced ModelItem

// Define a unique key for localStorage
const STORAGE_KEY = "project_llm_settings";

export function ProjectLLMSettings() {
  // State to store all LLM configurations
  const [modelItems, setModelItems] = useState([]);

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedSettings = localStorage.getItem(STORAGE_KEY);
    if (savedSettings) {
      try {
        const parsedSettings = JSON.parse(savedSettings);
        // Ensure we always have at least one item
        if (parsedSettings && parsedSettings.length > 0) {
          setModelItems(parsedSettings);
        } else {
          setModelItems([createDefaultModelItem()]);
        }
      } catch (error) {
        console.error("Failed to parse saved LLM settings:", error);
        // Initialize with a single default item if parsing fails
        setModelItems([createDefaultModelItem()]);
      }
    } else {
      // Initialize with a single default item if no saved settings
      setModelItems([createDefaultModelItem()]);
    }
  }, []);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    if (modelItems.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(modelItems));
    }
  }, [modelItems]);

  // Create a default model item with all possible fields initialized
  const createDefaultModelItem = () => {
    return {
      id: Date.now().toString(), // Generate a unique ID
      model: "",
      isLocal: false,
      apiKey: "",
      localPath: "",
      // Advanced settings
      endpointUrl: "",
      organizationId: "",
      temperature: 0.7,
      maxTokens: 4096,
      systemPrompt: "You are a helpful assistant.",
    };
  };

  // Add a new model item
  const addModelItem = (e) => {
    // Prevent default form submission behavior that might cause page reload
    if (e) e.preventDefault();

    setModelItems([...modelItems, createDefaultModelItem()]);
  };

  // Remove a model item by ID
  const removeModelItem = (idToRemove, e) => {
    // Prevent default form submission behavior
    if (e) e.preventDefault();

    // Allow removing any item, even the last one
    setModelItems((prevItems) =>
      prevItems.filter((item) => item.id !== idToRemove),
    );
  };

  // Update a specific field of a model item
  const updateModelItem = (id, field, value) => {
    setModelItems(
      modelItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  };

  // Catch any form submissions to prevent page reloads
  const handleFormSubmit = (e) => {
    e.preventDefault();
    return false;
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-[30dvh] text-setta-600 dark:text-setta-400"
      onSubmit={handleFormSubmit}
    >
      {modelItems.map((item) => (
        <ModelItem
          key={item.id}
          item={item}
          onUpdate={(field, value) => updateModelItem(item.id, field, value)}
          onRemove={(e) => removeModelItem(item.id, e)}
          allowCustomModel={true}
        />
      ))}

      <button
        type="button" // Explicitly set type to button to prevent form submission
        className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-solid border-setta-500/30 px-3 py-1.5 text-xs font-bold uppercase text-setta-700 hover:bg-white focus-visible:border-blue-500 dark:text-setta-400 dark:hover:bg-setta-800"
        onClick={addModelItem}
      >
        <MdAdd className="scale-110" />
        <p>Add an LLM</p>
      </button>
    </div>
  );
}
