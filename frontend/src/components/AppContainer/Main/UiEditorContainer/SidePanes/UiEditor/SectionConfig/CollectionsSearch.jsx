import {
  dbGetCollectionDetails,
  getCollectionsAndModulesFn,
} from "dbRequests/sectionConfig";
import _ from "lodash";
import { useState } from "react";
import { setCollections } from "state/actions/setCollections";
import { useGetSelectedCollectionsForSectionConfig } from "state/hooks/useSectionContents";
import { groupedObjInfo } from "utils/getFullObjPath";
import { Expandable } from "./Expandable";
import { SectionConfigSearch } from "./SectionConfigSearch";

export function CollectionsSearch({ sectionId }) {
  const [results, setResults] = useState({});
  const onSearch = getCollectionsAndModulesFn((x) => setResults(x));
  const selectedCollections =
    useGetSelectedCollectionsForSectionConfig(sectionId);
  const allResults = { ...selectedCollections, ...results };
  const selected = _.map(selectedCollections, (x) => x.id);

  async function onSelectionChange({ id, checked, newValueFn }) {
    if (checked) {
      // collection needs to be retrieved from db
      await dbGetCollectionDetails(id);
    }

    setCollections({
      sectionId,
      id,
      checked,
      newValueFn,
      incrementVersion: true,
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
  const groupedDetails = groupedObjInfo(details);

  return (
    <Expandable heading={children} value={name} defaultValue={0}>
      <div className="select-text rounded-md px-1 py-1">
        {Object.entries(groupedDetails).map(([k, v]) => (
          <div key={`ObjCollectionDetails-${k}`}>
            <p className="text-sm font-bold dark:text-setta-200">{k}</p>
            <ObjListText objList={v} />
          </div>
        ))}
      </div>
    </Expandable>
  );
}

function ObjListText({ objList }) {
  return objList.map((x) => (
    <div key={`ObjListText-${x.id}`} className="indent-2 dark:text-setta-200">
      {x.name}
    </div>
  ));
}
