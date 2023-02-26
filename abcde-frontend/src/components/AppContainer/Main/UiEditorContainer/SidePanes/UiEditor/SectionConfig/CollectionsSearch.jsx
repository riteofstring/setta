import { getCollectionDetails } from "dbRequests/sectionConfig";
import { useGetCollectionsAndModules } from "hooks/dbRequests/sectionConfig";
import { useGroupedObjInfos } from "hooks/useImmutableInfo";
import { useGetSelectedCollectionsForSectionConfig } from "hooks/useSectionContents";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { initializeParam } from "thunks/initializeParam";
import { setSectionUITypeConfig } from "thunks/uiTypes";
import { Expandable } from "./Expandable";
import { SectionConfigSearch } from "./SectionConfigSearch";

export function CollectionsSearch({ sectionId }) {
  const { results, onSearch } = useGetCollectionsAndModules();
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

function ObjCollectionDetails({ children, details, name }) {
  const groupedDetails = useGroupedObjInfos(details);

  return (
    <Expandable heading={children} value={name} defaultValue={0}>
      <div className="select-text rounded-md py-1 px-1">
        {Object.entries(groupedDetails).map(([k, v]) => (
          <div key={`ObjCollectionDetails-${k}`}>
            <h3 className="text-sm font-bold">{k}</h3>
            <ObjListText objList={v} />
          </div>
        ))}
      </div>
    </Expandable>
  );
}

function ObjListText({ objList }) {
  return objList.map((x) => (
    <div key={`ObjListText-${x.id}`} className="indent-2">
      {x.name}
    </div>
  ));
}
