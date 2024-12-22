import * as Accordion from "@radix-ui/react-accordion";
import _ from "lodash";
import { useEffect, useState } from "react";
import { FiChevronDown, FiTrash2 } from "react-icons/fi";
import { dbLoadAvailableArtifacts } from "requests/artifacts";
import { useArtifacts, useSectionInfos } from "state/definitions";
import { getSectionArtifactGroupMetadata } from "state/hooks/artifacts";

const LayersList = ({
  layers,
  availableArtifacts,
  onDrop,
  draggedId,
  onDeleteArtifact,
}) => {
  const [hoveredLayer, setHoveredLayer] = useState(null);
  const artifactsAlreadyInMemory = useArtifacts(
    (x) => _.mapValues(x, (a) => ({ name: a.name })),
    _.isEqual,
  );

  const allArtifacts = { ...availableArtifacts, ...artifactsAlreadyInMemory };

  const handleDragOver = (e, layerId) => {
    const layer = layers.find((l) => l.id === layerId);
    const hasArtifact = layer.artifactTransforms.find(
      (l) => l.artifactId === draggedId,
    );
    setHoveredLayer(layerId);
    if (hasArtifact) {
      return; // Don't prevent default - this prevents dropping
    }
    e.preventDefault(); // Necessary to allow dropping
  };

  const handleDragLeave = () => {
    setHoveredLayer(null);
  };

  const handleDrop = (e, layerId) => {
    e.preventDefault();
    setHoveredLayer(null);
    const artifactId = e.dataTransfer.getData("text/plain");
    onDrop(artifactId, layerId);
  };

  const getLayerStyle = (layer) => {
    if (!draggedId || hoveredLayer !== layer.id) {
      return "border-gray-300";
    }

    const hasArtifact = layer.artifactTransforms.find(
      (l) => l.artifactId === draggedId,
    );
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
          key={layer.id}
          className={`mb-2 rounded border-2 border-dashed p-2 transition-colors ${getLayerStyle(layer)} ${
            draggedId &&
            layer.artifactTransforms.find((l) => l.artifactId === draggedId)
              ? "cursor-not-allowed"
              : draggedId
                ? "cursor-copy"
                : ""
          }`}
          onDragOver={(e) => handleDragOver(e, layer.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, layer.id)}
        >
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            {layer.name}
          </h3>
          <div className="ml-4">
            {layer.artifactTransforms.map((transform) => (
              <div
                key={transform.artifactId}
                className="group flex items-center justify-between text-sm text-gray-600 dark:text-gray-400"
              >
                <span>{allArtifacts[transform.artifactId]?.name}</span>
                <button
                  onClick={() =>
                    onDeleteArtifact(layer.id, transform.artifactId)
                  }
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

export function ListOfArtifacts({ sectionId, sectionTypeName }) {
  const layers = useSectionInfos(
    (state) => getSectionArtifactGroupMetadata(sectionId, state),
    _.isEqual,
  );
  const [availableArtifacts, setAvailableArtifacts] = useState({});
  const [loadedDetails, setLoadedDetails] = useState({});

  useEffect(() => {
    async function fn() {
      const res = await dbLoadAvailableArtifacts(sectionTypeName);
      if (res.status == 200) {
        setAvailableArtifacts(res.data);
      }
    }

    fn();
  }, []);

  const [draggedId, setDraggedId] = useState(null);

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  const handleDragStart = (e, artifactId) => {
    e.dataTransfer.setData("text/plain", artifactId);
    setDraggedId(artifactId);
  };

  const handleLayerDrop = (artifactId, targetLayerId) => {
    useSectionInfos.setState((x) => {
      const targetLayer = x.artifactGroups[targetLayerId];
      targetLayer.artifactTransforms.push({ artifactId });
    });
  };

  const handleDeleteArtifact = (layerId, artifactId) => {
    useSectionInfos.setState((x) => {
      const targetLayer = x.artifactGroups[layerId];
      targetLayer.artifactTransforms = targetLayer.artifactTransforms.filter(
        (t) => t.artifactId !== artifactId,
      );
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-clip">
      <LayersList
        layers={layers}
        availableArtifacts={availableArtifacts}
        onDrop={handleLayerDrop}
        draggedId={draggedId}
        onDeleteArtifact={handleDeleteArtifact}
      />

      <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Available Artifacts
      </h2>

      <Accordion.Root type="multiple" className="w-full">
        {Object.entries(availableArtifacts).map(([id, item]) => (
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
                {loadedDetails[item.id] ? (
                  <pre className="text-gray-900 dark:text-gray-100">
                    {JSON.stringify(loadedDetails[item.id], null, 2)}
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
