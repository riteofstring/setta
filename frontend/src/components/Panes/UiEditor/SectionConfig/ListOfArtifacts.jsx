import * as Accordion from "@radix-ui/react-accordion";
import _ from "lodash";
import { useEffect, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import { dbLoadAvailableArtifacts } from "requests/artifacts";
import { useArtifacts, useSectionInfos } from "state/definitions";
import useDeepCompareEffect from "use-deep-compare-effect";

export function ListOfArtifacts({ sectionId, sectionTypeName }) {
  const [availableArtifacts, setAvailableArtifacts] = useState({});
  const selectedArtifactIds = useSectionInfos(
    (x) => x.x[sectionId].artifactIds,
    _.isEqual,
  );
  const [loadedDetails, setLoadedDetails] = useState({});

  useEffect(() => {
    async function fn() {
      const res = await dbLoadAvailableArtifacts(sectionTypeName);
      if (res.status == 200) {
        // the selectedArtifactIds hook below finishes before this,
        // so we merge with the existing state rather than replace
        setAvailableArtifacts((state) => ({ ...state, ...res.data }));
      }
    }

    fn();
  }, []);

  useDeepCompareEffect(() => {
    const newState = _.cloneDeep(availableArtifacts);
    for (const id of selectedArtifactIds) {
      if (!(id in availableArtifacts)) {
        const { name, type, path } = useArtifacts.getState().x[id];
        newState[id] = { name, type, path };
      }
    }
    setAvailableArtifacts(newState);
  }, [selectedArtifactIds]);

  const handleCheckboxChange = (e, artifactId) => {
    console.log("e.target.checked", e.target.checked);
    useSectionInfos.setState((x) => {
      if (e.target.checked && !selectedArtifactIds.includes(artifactId)) {
        x.x[sectionId].artifactIds.push(artifactId);
      } else if (
        !e.target.checked &&
        selectedArtifactIds.includes(artifactId)
      ) {
        x.x[sectionId].artifactIds = x.x[sectionId].artifactIds.filter(
          (id) => id !== artifactId,
        );
      }
    });
  };

  const loadItemDetails = async (itemName) => {
    try {
      // This would be replaced with actual API call
      const response = await fetch(`/api/items/${itemName}`);
      const data = await response.json();
      setLoadedDetails((prev) => ({
        ...prev,
        [itemName]: data,
      }));
    } catch (error) {
      console.error("Failed to load item details:", error);
    }
  };

  console.log(
    "Object.entries(availableArtifacts)",
    Object.entries(availableArtifacts),
  );

  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-clip">
      <Accordion.Root type="multiple" className="w-full">
        {Object.entries(availableArtifacts).map(([id, item]) => (
          <Accordion.Item
            key={id}
            value={item.name}
            className="border-b border-gray-200 last:border-0 dark:border-gray-700"
          >
            <div className="flex items-center gap-2 p-2">
              <input
                type="checkbox"
                className="h-4 w-4 cursor-pointer rounded border-gray-300 bg-white text-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                checked={selectedArtifactIds.includes(id)}
                onChange={(e) => handleCheckboxChange(e, id)}
              />

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
                {loadedDetails[item.name] ? (
                  <pre className="text-gray-900 dark:text-gray-100">
                    {JSON.stringify(loadedDetails[item.name], null, 2)}
                  </pre>
                ) : (
                  <div className="text-gray-500 dark:text-gray-400">
                    Loading details...
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
