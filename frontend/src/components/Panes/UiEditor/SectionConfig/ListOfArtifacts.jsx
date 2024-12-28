import * as Accordion from "@radix-ui/react-accordion";
import _ from "lodash";
import { useEffect, useState } from "react";
import { FiChevronDown, FiTrash2 } from "react-icons/fi";
import { dbLoadAvailableArtifacts } from "requests/artifacts";
import { useArtifacts, useSectionInfos } from "state/definitions";
import {
  getAllSectionArtifactIds,
  getSectionArtifactGroupMetadata,
} from "state/hooks/artifacts";
import { newArtifactTransform } from "utils/objs/artifact";

const LayersList = ({
  sectionId,
  availableArtifacts,
  onDrop,
  draggedId,
  onDeleteArtifact,
}) => {
  const layers = useSectionInfos(
    (state) => getSectionArtifactGroupMetadata(sectionId, state),
    _.isEqual,
  );

  const [hoveredLayer, setHoveredLayer] = useState(null);
  const artifactsAlreadyInMemory = useArtifacts(
    (x) => _.mapValues(x, (a) => ({ name: a.name })),
    _.isEqual,
  );

  const allArtifacts = { ...availableArtifacts, ...artifactsAlreadyInMemory };

  const handleDragOver = (e, layerId) => {
    setHoveredLayer(layerId);
  };

  const handleDragLeave = () => {
    setHoveredLayer(null);
  };

  const handleDrop = (e, layerId) => {
    setHoveredLayer(null);
    const artifactId = e.dataTransfer.getData("text/plain");
    onDrop(artifactId, layerId);
  };

  const getLayerStyle = (layer) => {
    if (!draggedId || hoveredLayer !== layer.id) {
      return "border-gray-300";
    }

    return "border-green-500 bg-green-50";
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
            draggedId ? "cursor-copy" : ""
          }`}
          onDragOver={(e) => handleDragOver(e, layer.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, layer.id)}
        >
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            {layer.name}
          </h3>
          <div className="ml-4">
            {layer.artifactIdsUsed.map((artifactId, idx) => (
              <div
                key={idx}
                className="group flex items-center justify-between text-sm text-gray-600 dark:text-gray-400"
              >
                <span>{allArtifacts[artifactId]?.name}</span>
                <button
                  onClick={() => onDeleteArtifact(layer.id, artifactId)}
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

export function ListOfArtifacts({
  sectionTypeName,
  availableArtifacts,
  setAvailableArtifacts,
  onDragStart,
  onDragEnd,
  onClick,
  getItemStyle,
}) {
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

  const draggable = Boolean(onDragStart);

  return (
    <>
      <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Available Artifacts
      </h2>

      <Accordion.Root type="multiple" className="w-full">
        {Object.entries(availableArtifacts).map(([id, item]) => (
          <Accordion.Item
            key={id}
            value={item.name}
            className={`border-b last:border-0 ${getItemStyle?.(id) ?? "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"}`}
            draggable={draggable}
            onDragStart={(e) => onDragStart?.(e, id)}
            onDragEnd={onDragEnd}
            onClick={() => onClick?.(id, item.type)}
          >
            <div
              className={`flex ${draggable ? "cursor-move" : "cursor-pointer"} items-center gap-2 p-2`}
            >
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
    </>
  );
}

export function LayerListAndListOfArtifacts({ sectionId, sectionTypeName }) {
  const [availableArtifacts, setAvailableArtifacts] = useState({});
  const [draggedId, setDraggedId] = useState(null);

  const handleLayerDrop = (artifactId, targetLayerId) => {
    useSectionInfos.setState((x) => {
      const targetLayer = x.artifactGroups[targetLayerId];
      const artifactType = availableArtifacts[artifactId].type;
      targetLayer.artifactTransforms.push(
        newArtifactTransform(artifactId, sectionTypeName, artifactType),
      );
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

  const onDragEnd = () => {
    setDraggedId(null);
  };

  const onDragStart = (e, artifactId) => {
    e.dataTransfer.setData("text/plain", artifactId);
    setDraggedId(artifactId);
  };

  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-clip">
      <LayersList
        sectionId={sectionId}
        availableArtifacts={availableArtifacts}
        onDrop={handleLayerDrop}
        draggedId={draggedId}
        onDeleteArtifact={handleDeleteArtifact}
      />
      <ListOfArtifacts
        sectionTypeName={sectionTypeName}
        availableArtifacts={availableArtifacts}
        setAvailableArtifacts={setAvailableArtifacts}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
    </div>
  );
}

export function JustListOfArtifacts({ sectionId, sectionTypeName, onClick }) {
  const [availableArtifacts, setAvailableArtifacts] = useState({});
  const selectedArtifactIds = useSectionInfos(
    (state) => getAllSectionArtifactIds(sectionId, state),
    _.isEqual,
  );

  function getItemStyle(id) {
    return selectedArtifactIds.has(id)
      ? "border-gray-200 bg-blue-800 hover:bg-blue-50 dark:hover:bg-blue-500"
      : null;
  }

  return (
    <ListOfArtifacts
      sectionTypeName={sectionTypeName}
      availableArtifacts={availableArtifacts}
      setAvailableArtifacts={setAvailableArtifacts}
      getItemStyle={getItemStyle}
      onClick={onClick}
    />
  );
}
