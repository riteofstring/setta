import * as Accordion from "@radix-ui/react-accordion";
import _ from "lodash";
import { useEffect, useState } from "react";
import { FiChevronDown, FiTrash2 } from "react-icons/fi";
import { dbLoadAvailableArtifacts } from "requests/artifacts";
import { maybeAddArtifactGroupAndSetArtifactId } from "state/actions/artifacts";
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
    <section className="mb-4 rounded-xl border border-white bg-white px-4 py-2 shadow-[inset_0_3px_8px_0_rgb(0_0_0_/_0.15)] dark:border-setta-700 dark:bg-setta-800 dark:shadow-[inset_0_1px_8px_0_rgb(0_0_0_/_0.6)]">
      <h3 className="mb-2 mt-1 text-sm font-bold text-setta-400 dark:text-setta-600">
        Add / Remove Layer Contents
      </h3>

      {layers.map((layer) => (
        <div
          key={layer.id}
          className={`-mx-2 mb-2 rounded-lg border px-2 py-1 transition-colors hover:bg-setta-100/30 dark:hover:bg-setta-900/50 ${getLayerStyle(layer)} ${
            draggedId
              ? "cursor-copy border-dashed border-blue-500"
              : "border-transparent"
          }`}
          onDragOver={(e) => handleDragOver(e, layer.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, layer.id)}
        >
          <h4 className="text-xs font-bold uppercase text-setta-600 dark:text-setta-400">
            {layer.name}
          </h4>
          <div className="ml-2">
            {layer.artifactIdsUsed.map((artifactId, idx) => (
              <div
                key={idx}
                className="group flex items-center justify-between text-xs text-setta-600 dark:text-setta-400"
              >
                <div className="flex gap-1">
                  <i className="gg-image text-setta-300 dark:text-setta-600" />
                  <p>{availableArtifacts[artifactId]?.name}</p>
                </div>

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
    </section>
  );
};

export function ListOfArtifacts({
  availableArtifacts,
  onDragStart,
  onDragEnd,
  onClick,
  getItemStyle,
}) {
  const [loadedDetails, setLoadedDetails] = useState({});

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
            className={`border-b last:border-0 ${getItemStyle?.(id) ?? "border-setta-200 hover:bg-setta-50 dark:border-setta-700 dark:hover:bg-setta-800"}`}
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
  const availableArtifacts = useArtifactsKnownByDbAndInMemory(sectionTypeName);
  const [draggedId, setDraggedId] = useState(null);

  const handleLayerDrop = (artifactId, targetLayerId) => {
    useSectionInfos.setState((x) => {
      const targetLayer = x.artifactGroups[targetLayerId];
      const artifactType = artifactsKnownByDb[artifactId].type;
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
        availableArtifacts={availableArtifacts}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
    </div>
  );
}

export function JustListOfArtifacts({ sectionId, sectionTypeName }) {
  const availableArtifacts = useArtifactsKnownByDbAndInMemory(sectionTypeName);
  const selectedArtifactIds = useSectionInfos(
    (state) => getAllSectionArtifactIds(sectionId, state),
    _.isEqual,
  );

  function getItemStyle(id) {
    return selectedArtifactIds.has(id)
      ? "border-gray-200 bg-blue-800 hover:bg-blue-50 dark:hover:bg-blue-500"
      : null;
  }

  function onClick(artifactId, artifactType) {
    useSectionInfos.setState((state) => {
      maybeAddArtifactGroupAndSetArtifactId(
        sectionId,
        sectionTypeName,
        artifactId,
        artifactType,
        state,
      );
    });
  }

  return (
    <ListOfArtifacts
      availableArtifacts={availableArtifacts}
      getItemStyle={getItemStyle}
      onClick={onClick}
    />
  );
}

function useArtifactsKnownByDbAndInMemory(sectionTypeName) {
  const [artifactsKnownByDb, setArtifactsKnownByDb] = useState({});
  const artifactsInMemory = useArtifacts(
    (x) =>
      _.mapValues(x, (a) => ({ name: a.name, path: a.path, type: a.type })),
    _.isEqual,
  );

  useEffect(() => {
    async function fn() {
      const res = await dbLoadAvailableArtifacts(sectionTypeName);
      if (res.status == 200) {
        setArtifactsKnownByDb(res.data);
      }
    }

    fn();
  }, []);

  return { ...artifactsKnownByDb, ...artifactsInMemory };
}
