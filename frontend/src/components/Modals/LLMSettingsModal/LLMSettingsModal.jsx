import { useEffect, useRef, useState } from "react";
import { HiChevronDown, HiOutlineTrash } from "react-icons/hi";
import { getAvailableModels } from "services/aiService";

// Default services to include
const DEFAULT_SERVICES = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
];

export function LLMSettingsModal({ onClose }) {
  const [services, setServices] = useState([
    { id: "openai", label: "OpenAI", apiKey: "", selectedModel: "" },
    { id: "anthropic", label: "Anthropic", apiKey: "", selectedModel: "" },
    { id: "together", label: "Together", apiKey: "", selectedModel: "" },
  ]);
  const [newService, setNewService] = useState({
    id: "",
    label: "",
    apiKey: "",
    selectedModel: "",
  });
  const [availableModels, setAvailableModels] = useState([]);
  // Track which provider's dropdown is open
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const dropdownRefs = useRef({});

  useEffect(() => {
    // Load saved API keys from localStorage
    try {
      const savedKeys =
        JSON.parse(localStorage.getItem("llm_service_keys")) || {};

      // Load saved provider models from localStorage
      const savedProviderModels =
        JSON.parse(localStorage.getItem("llm_provider_models")) || {};

      setServices(
        services.map((service) => ({
          ...service,
          apiKey: savedKeys[service.id] || "",
          selectedModel: savedProviderModels[service.id] || "",
        })),
      );

      // Load available models
      fetchModels();
    } catch (error) {
      console.error("Error loading data:", error);
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        openDropdownId &&
        dropdownRefs.current[openDropdownId] &&
        !dropdownRefs.current[openDropdownId].contains(event.target)
      ) {
        setOpenDropdownId(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openDropdownId]);

  const fetchModels = async () => {
    try {
      const models = await getAvailableModels();
      setAvailableModels(models);
    } catch (error) {
      console.error("Error fetching models:", error);
    }
  };

  const handleSave = () => {
    try {
      // Save API keys to localStorage
      const apiKeys = {};
      services.forEach((service) => {
        apiKeys[service.id] = service.apiKey;
      });
      localStorage.setItem("llm_service_keys", JSON.stringify(apiKeys));

      // Save provider-specific models to localStorage
      const providerModels = {};
      services.forEach((service) => {
        if (service.selectedModel) {
          providerModels[service.id] = service.selectedModel;
        }
      });
      localStorage.setItem(
        "llm_provider_models",
        JSON.stringify(providerModels),
      );

      onClose();
    } catch (error) {
      console.error("Error saving settings:", error);
      try {
        window.alert("Error saving settings. Please try again.");
      } catch (alertError) {
        console.error("Error showing alert:", alertError);
      }
    }
  };

  const handleServiceChange = (id, field, value) => {
    setServices(
      services.map((service) =>
        service.id === id ? { ...service, [field]: value } : service,
      ),
    );
  };

  const handleAddNewService = () => {
    try {
      // Check for empty fields
      if (!newService.id || !newService.label) {
        try {
          window.alert("Service ID and Label are required");
        } catch (alertError) {
          console.error("Error showing alert:", alertError);
        }
        return;
      }

      // Check for duplicate service ID
      if (services.some((service) => service.id === newService.id)) {
        try {
          window.alert("Service ID must be unique");
        } catch (alertError) {
          console.error("Error showing alert:", alertError);
        }
        return;
      }

      // Add new service
      setServices([...services, { ...newService }]);
      setNewService({ id: "", label: "", apiKey: "", selectedModel: "" });
    } catch (error) {
      console.error("Error adding new service:", error);
    }
  };

  const handleRemoveService = (id) => {
    setServices(services.filter((service) => service.id !== id));
    if (openDropdownId === id) {
      setOpenDropdownId(null);
    }
  };

  const toggleDropdown = (serviceId) => {
    setOpenDropdownId(openDropdownId === serviceId ? null : serviceId);
  };

  const handleModelSelect = (serviceId, modelId) => {
    handleServiceChange(serviceId, "selectedModel", modelId);
    setOpenDropdownId(null);
  };

  // Get models filtered by service ID
  const getModelsForService = (serviceId) => {
    return availableModels.filter(
      (model) => model.serviceId === serviceId || !model.serviceId,
    );
  };

  // Get selected model name for display
  const getSelectedModelName = (serviceId, modelId) => {
    if (!modelId) return "Select a model";

    const model = availableModels.find((m) => m.id === modelId);
    return model ? model.name : modelId;
  };

  return (
    <div className="flex h-full max-h-[80vh] w-full flex-col">
      <div className="mb-2">
        <h2 className="text-xl font-semibold text-setta-900 dark:text-white">
          LLM API Keys
        </h2>
        <p className="mt-1 text-sm text-setta-500 dark:text-setta-400">
          Your API keys are stored locally in your browser and are never sent to
          our servers.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-1">
        <div className="space-y-5">
          {services.map((service) => (
            <div
              key={service.id}
              className="space-y-2 rounded-md p-2 hover:bg-setta-50 dark:hover:bg-setta-800/30"
            >
              <div className="flex items-center justify-between">
                <label
                  htmlFor={`api-key-${service.id}`}
                  className="text-base font-medium text-setta-700 dark:text-setta-300"
                >
                  {service.label}
                </label>
                <button
                  type="button"
                  onClick={() => handleRemoveService(service.id)}
                  className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                >
                  <HiOutlineTrash className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3">
                {/* API Key Input */}
                <div>
                  <label
                    htmlFor={`api-key-${service.id}`}
                    className="block text-xs text-setta-500 dark:text-setta-400"
                  >
                    API Key
                  </label>
                  <input
                    id={`api-key-${service.id}`}
                    type="password"
                    value={service.apiKey}
                    onChange={(e) =>
                      handleServiceChange(service.id, "apiKey", e.target.value)
                    }
                    className="mt-1 block w-full border-0 border-b border-solid border-setta-300 bg-transparent px-0 py-1 text-sm focus:border-blue-500 focus:outline-none dark:border-setta-600 dark:text-white"
                    placeholder={`Enter ${service.label} API Key`}
                  />
                </div>

                {/* Model Selection Dropdown */}
                <div>
                  <label
                    htmlFor={`model-select-${service.id}`}
                    className="block text-xs text-setta-500 dark:text-setta-400"
                  >
                    {service.label} Model
                  </label>
                  <div
                    className="relative"
                    ref={(el) => (dropdownRefs.current[service.id] = el)}
                  >
                    <button
                      id={`model-select-${service.id}`}
                      data-testid={`${service.id}-model-select`}
                      type="button"
                      onClick={() => toggleDropdown(service.id)}
                      value={service.selectedModel}
                      className="mt-1 flex w-full items-center justify-between border-0 border-b border-solid border-setta-300 bg-transparent px-0 py-1 text-left text-sm focus:border-blue-500 focus:outline-none dark:border-setta-600 dark:text-white"
                    >
                      <span>
                        {getSelectedModelName(
                          service.id,
                          service.selectedModel,
                        ) || "Select a model"}
                      </span>
                      <HiChevronDown
                        className={`h-4 w-4 text-setta-500 transition-transform dark:text-setta-400 ${openDropdownId === service.id ? "rotate-180" : ""}`}
                      />
                    </button>

                    {openDropdownId === service.id && (
                      <div className="absolute left-0 z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-setta-300 bg-white shadow-lg dark:border-setta-700 dark:bg-setta-800">
                        <ul className="py-1">
                          {getModelsForService(service.id).map((model) => (
                            <li
                              key={model.id}
                              onClick={() =>
                                handleModelSelect(service.id, model.id)
                              }
                              className={`cursor-pointer px-3 py-2 text-sm hover:bg-setta-100 dark:hover:bg-setta-700 ${model.id === service.selectedModel ? "bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" : ""}`}
                            >
                              {model.name}
                            </li>
                          ))}
                          {getModelsForService(service.id).length === 0 && (
                            <li className="px-3 py-2 text-sm italic text-setta-400 dark:text-setta-500">
                              No models available for this provider
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-2 rounded-md border border-solid border-setta-200 p-3 dark:border-setta-700">
          <h3 className="text-sm font-medium text-setta-700 dark:text-setta-300">
            Add Custom LLM
          </h3>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="service-id"
                className="block text-xs text-setta-500 dark:text-setta-400"
              >
                Service ID
              </label>
              <input
                id="service-id"
                type="text"
                value={newService.id}
                onChange={(e) =>
                  setNewService({ ...newService, id: e.target.value })
                }
                className="mt-1 block w-full border-0 border-b border-solid border-setta-300 bg-transparent px-0 py-1 text-sm focus:border-blue-500 focus:outline-none dark:border-setta-600 dark:text-white"
                placeholder="E.g., mistral"
              />
            </div>
            <div>
              <label
                htmlFor="service-label"
                className="block text-xs text-setta-500 dark:text-setta-400"
              >
                Service Label
              </label>
              <input
                id="service-label"
                type="text"
                value={newService.label}
                onChange={(e) =>
                  setNewService({ ...newService, label: e.target.value })
                }
                className="mt-1 block w-full border-0 border-b border-solid border-setta-300 bg-transparent px-0 py-1 text-sm focus:border-blue-500 focus:outline-none dark:border-setta-600 dark:text-white"
                placeholder="E.g., Mistral AI"
              />
            </div>
          </div>
          <div className="mb-2">
            <label
              htmlFor="service-api-key"
              className="block text-xs text-setta-500 dark:text-setta-400"
            >
              API Key
            </label>
            <input
              id="service-api-key"
              type="password"
              value={newService.apiKey}
              onChange={(e) =>
                setNewService({ ...newService, apiKey: e.target.value })
              }
              className="mt-1 block w-full border-0 border-b border-solid border-setta-300 bg-transparent px-0 py-1 text-sm focus:border-blue-500 focus:outline-none dark:border-setta-600 dark:text-white"
              placeholder="Enter API Key"
            />
          </div>
          <button
            type="button"
            onClick={handleAddNewService}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Add Service
          </button>
        </div>
      </div>

      <div className="mt-4 flex justify-end space-x-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-setta-300 bg-white px-4 py-2 text-sm font-medium text-setta-700 shadow-sm hover:bg-setta-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-setta-600 dark:bg-setta-700 dark:text-white dark:hover:bg-setta-600"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Save
        </button>
      </div>
    </div>
  );
}
