import {
  getCollectionDetails,
  getCollectionsAndModules,
} from "dbRequests/sectionConfig";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useGetSectionType } from "hooks/useSectionType";
import { useActiveSection } from "models/activeSection";
import { useCodeInfo } from "models/info/codeInfo";
import { useUIEditor } from "models/uiEditor";
import React, { useState } from "react";
import { setSectionUITypeConfig, setSectionUITypeId } from "thunks/uiTypes";
import SectionConfigComp from "./SectionConfigComp";
import SectionConfigTypeSelection from "./SectionConfigTypeSelection";

export default React.memo(SectionConfig);

function SectionConfig() {
  const sectionId = useActiveSection((x) => x.id);
  const setActiveSection = useActiveSection((x) => x.setId);
  const cameFromUIConfig = useUIEditor((x) => x.cameFromUIConfig);
  const setCameFromUIConfig = useUIEditor((x) => x.setCameFromUIConfig);
  const setTabIndex = useUIEditor((x) => x.setTabIndex);
  const [parentId] = useGetSectionInfo(sectionId, ["parentId"]);
  const [currTypeId, savedConfig] = useGetSectionType(sectionId, [
    "id",
    "config",
  ]);

  const onGoBackClick = () => {
    setActiveSection(parentId);
    setCameFromUIConfig(false);
    setTabIndex(1);
  };

  const onSectionTypeChange = (e) => {
    if (e && e !== currTypeId) {
      setSectionUITypeId({ uiTypeId: e, sectionId });
    }
  };

  const onConfigChange = ({ newValueFn }) => {
    setSectionUITypeConfig({
      sectionId,
      configProps: { configName: "collections", newValueFn },
    });
  };

  return (
    <>
      {cameFromUIConfig && <button onClick={onGoBackClick}>Go back</button>}
      <SectionConfigCore
        onSectionTypeChange={onSectionTypeChange}
        currTypeId={currTypeId}
        sectionId={sectionId}
        savedConfig={savedConfig}
        onConfigChange={onConfigChange}
      />
    </>
  );
}

function SectionConfigCore({
  onSectionTypeChange,
  currTypeId,
  sectionId,
  savedConfig,
  onConfigChange,
}) {
  const [results, setResults] = useState({});
  const allCollections = useCodeInfo((x) => x.allCollections);
  const updateCodeInfos = useCodeInfo((x) => x.updateInfos);

  async function onSubmit(searchTerm) {
    const x = await getCollectionsAndModules({ allCollections, searchTerm });
    setResults(x);
  }

  async function onChange({ newValueFn, id }) {
    // collection needs to be retrieved from db
    if (!(id in allCollections)) {
      const collectionDetails = await getCollectionDetails(id);
      updateCodeInfos(collectionDetails);
    }
    onConfigChange({ newValueFn });
  }

  return (
    <>
      <h3 className="text-xs uppercase text-gray-400 font-semibold">
        Card Types
      </h3>
      <SectionConfigTypeSelection
        onDropdownSelect={onSectionTypeChange}
        selectedId={currTypeId}
        sectionId={sectionId}
      />
      <h3 className="text-xs uppercase text-gray-400 font-semibold">
        Contents
      </h3>

      <div
        className="py-2 px-3 rounded-2xl bg-white shadow-inner border border-white grow mb-10 flex flex-col"
        data-testid={`SectionConfig ${sectionId}`}
      >
        <Search onSubmit={onSubmit} />
        <SectionConfigComp
          savedConfig={savedConfig}
          onChange={onChange}
          allCollections={allCollections}
          results={results}
        />
      </div>
    </>
  );
}

function Search({ onSubmit }) {
  const [text, setText] = useState("");
  function onChange(e) {
    setText(e.target.value);
  }
  function onClick() {
    onSubmit(text);
  }

  return (
    <div className="pb-4">
      <input className="w-4/5" placeholder="Search" onChange={onChange} />
      <button className="h-7" onClick={onClick}>
        Go
      </button>
    </div>
  );
}
