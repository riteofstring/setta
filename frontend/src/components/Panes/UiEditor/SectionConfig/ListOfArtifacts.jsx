import * as Accordion from "@radix-ui/react-accordion";
import { useState } from "react";
import { FiChevronDown, FiTrash2 } from "react-icons/fi";

// Initial data remains the same
const INITIAL_ARTIFACTS = {
  artifact1: {
    name: "Configuration Parser",
    type: "Python Script",
    path: "/scripts/config_parser.py",
  },
  artifact2: {
    name: "Data Processor",
    type: "JavaScript Module",
    path: "/src/data/processor.js",
  },
  artifact3: {
    name: "Visualization Component",
    type: "React Component",
    path: "/components/DataViz.tsx",
  },
  artifact4: {
    name: "Style Generator",
    type: "CSS Module",
    path: "/styles/generator.css",
  },
};

const INITIAL_LAYERS = [
  {
    name: "Data Layer",
    artifactIds: ["artifact1", "artifact2"],
  },
  {
    name: "Processing Layer",
    artifactIds: ["artifact2", "artifact3"],
  },
  {
    name: "Presentation Layer",
    artifactIds: ["artifact3", "artifact4"],
  },
];

const LayersList = ({ layers, onDrop, draggedId, onDeleteArtifact }) => {
  const [hoveredLayer, setHoveredLayer] = useState(null);

  const handleDragOver = (e, layerName) => {
    const layer = layers.find((l) => l.name === layerName);
    const hasArtifact = layer.artifactIds.includes(draggedId);
    setHoveredLayer(layerName);
    if (hasArtifact) {
      return; // Don't prevent default - this prevents dropping
    }
    e.preventDefault(); // Necessary to allow dropping
  };

  const handleDragLeave = () => {
    setHoveredLayer(null);
  };

  const handleDrop = (e, layerName) => {
    e.preventDefault();
    setHoveredLayer(null);
    const artifactId = e.dataTransfer.getData("text/plain");
    onDrop(artifactId, layerName);
  };

  const getLayerStyle = (layer) => {
    if (!draggedId || hoveredLayer !== layer.name) {
      return "border-gray-300";
    }

    const hasArtifact = layer.artifactIds.includes(draggedId);
    return hasArtifact
      ? "border-red-500 bg-red-50"
      : "border-green-500 bg-green-50";
  };

  return (
    <div className="mb-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
      <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Layers
      </h2>
      {layers.map((layer) => (
        <div
          key={layer.name}
          className={`mb-2 rounded border-2 border-dashed p-2 transition-colors ${getLayerStyle(layer)} ${
            draggedId && layer.artifactIds.includes(draggedId)
              ? "cursor-not-allowed"
              : draggedId
                ? "cursor-copy"
                : ""
          }`}
          onDragOver={(e) => handleDragOver(e, layer.name)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, layer.name)}
        >
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            {layer.name}
          </h3>
          <div className="ml-4">
            {layer.artifactIds.map((id) => (
              <div
                key={id}
                className="group flex items-center justify-between text-sm text-gray-600 dark:text-gray-400"
              >
                <span>{INITIAL_ARTIFACTS[id]?.name || id}</span>
                <button
                  onClick={() => onDeleteArtifact(layerName, id)}
                  className="cursor-pointer p-1 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                >
                  <FiTrash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// DUMMY_DETAILS remains the same
const DUMMY_DETAILS = {
  "Configuration Parser": {
    description: "Parses configuration files in YAML format",
    lastModified: "2024-03-15",
    author: "Jane Doe",
  },
  "Data Processor": {
    description: "Processes raw data into normalized format",
    lastModified: "2024-03-16",
    author: "John Smith",
  },
};

export function ListOfArtifacts() {
  const [layers, setLayers] = useState(INITIAL_LAYERS);
  const [draggedId, setDraggedId] = useState(null);

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  const handleDragStart = (e, artifactId) => {
    e.dataTransfer.setData("text/plain", artifactId);
    setDraggedId(artifactId);
  };

  const handleLayerDrop = (artifactId, targetLayerName) => {
    setLayers((prevLayers) => {
      return prevLayers.map((layer) => {
        if (
          layer.name === targetLayerName &&
          !layer.artifactIds.includes(artifactId)
        ) {
          return {
            ...layer,
            artifactIds: [...layer.artifactIds, artifactId],
          };
        }
        return layer;
      });
    });
  };

  const handleDeleteArtifact = (layerName, artifactId) => {
    setLayers((prevLayers) =>
      prevLayers.map((layer) => {
        if (layer.name === layerName) {
          return {
            ...layer,
            artifactIds: layer.artifactIds.filter((id) => id !== artifactId),
          };
        }
        return layer;
      }),
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-clip">
      <LayersList
        layers={layers}
        onDrop={handleLayerDrop}
        draggedId={draggedId}
        onDeleteArtifact={handleDeleteArtifact}
      />

      <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Available Artifacts
      </h2>

      <Accordion.Root type="multiple" className="w-full">
        {Object.entries(INITIAL_ARTIFACTS).map(([id, item]) => (
          <Accordion.Item
            key={id}
            value={item.name}
            className="border-b border-gray-200 last:border-0 dark:border-gray-700"
            draggable
            onDragStart={(e) => handleDragStart(e, id)}
            onDragEnd={handleDragEnd}
          >
            <div className="flex cursor-move items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-800">
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {item.name}
                    </span>
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                      {item.type}
                    </span>
                  </div>
                  <Accordion.Trigger className="p-2">
                    <FiChevronDown className="transform text-gray-500 transition-transform duration-200 ease-in-out group-data-[state=open]:rotate-180 dark:text-gray-400" />
                  </Accordion.Trigger>
                </div>
                {item.path && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {item.path}
                  </div>
                )}
              </div>
            </div>

            <Accordion.Content className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
              <div className="bg-gray-50 p-4 dark:bg-gray-800">
                {DUMMY_DETAILS[item.name] ? (
                  <pre className="text-gray-900 dark:text-gray-100">
                    {JSON.stringify(DUMMY_DETAILS[item.name], null, 2)}
                  </pre>
                ) : (
                  <div className="text-gray-500 dark:text-gray-400">
                    No additional details available
                  </div>
                )}
              </div>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </div>
  );
}
