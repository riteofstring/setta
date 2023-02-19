import * as Collapsible from "@radix-ui/react-collapsible";
import {
  getCollectionDetails,
  getCollectionsAndModules,
} from "dbRequests/sectionConfig";
import { useGroupedObjInfos } from "hooks/useImmutableInfo";
import { useGetSelectedCollectionsForSectionConfig } from "hooks/useSectionContents";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useState } from "react";
import { initializeParam } from "thunks/initializeParam";
import { setSectionUITypeConfig } from "thunks/uiTypes";
import { SectionConfigSearch } from "./SectionConfigSearch";

export function CollectionsSearch({ sectionId }) {
  const [results, setResults] = useState({});
  const selectedCollections =
    useGetSelectedCollectionsForSectionConfig(sectionId);
  const allResults = { ...selectedCollections, ...results };
  const selected = _.map(selectedCollections, (x) => x.id);

  async function onSelectionChange({ newValueFn, id }) {
    // collection needs to be retrieved from db
    await getCollectionDetails(id);
    initializeParam(sectionId, useCodeInfo.getState().params[id]);
    setSectionUITypeConfig({
      sectionId,
      configProps: { configName: "collections", newValueFn },
    });
  }

  async function onSearch(searchTerm) {
    const x = await getCollectionsAndModules({ searchTerm });
    setResults(x);
  }

  return (
    <SectionConfigSearch
      sectionId={sectionId}
      onSelectionChange={onSelectionChange}
      onSearch={onSearch}
      selected={selected}
      results={allResults}
      isCheckbox={true}
      DetailsComponent={ObjCollectionDetails}
    />
  );
}

function ObjCollectionDetails({ children, details }) {
  const groupedDetails = useGroupedObjInfos(details);

  return (
    <Collapsible.Root>
      <Collapsible.Trigger asChild>{children}</Collapsible.Trigger>
      <Collapsible.Content>
        <div className="mt-2 select-text rounded-md bg-slate-200 py-3 px-5">
          {Object.entries(groupedDetails).map(([k, v]) => (
            <div key={`ObjCollectionDetails-${k}`}>
              <h3 className="text-sm font-bold">{k}</h3>
              <ObjListText objList={v} />
            </div>
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function ObjListText({ objList }) {
  return objList.map((x) => (
    <div key={`ObjListText-${x.id}`} style={{ textIndent: "20px" }}>
      {x.name}
    </div>
  ));
}
