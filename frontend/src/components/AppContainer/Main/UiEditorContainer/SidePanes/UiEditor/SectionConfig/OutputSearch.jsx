import { useAllOutputNames } from "state/hooks/useOutputNames";
import {
  setSectionInfoAttr,
  setSectionName,
  setSectionSize,
} from "state/actions/setters";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { useGetSectionInfo } from "state/hooks/useGetSectionInfo";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { INITIAL_CHART_SIZE } from "utils/constants";
import { Expandable } from "./Expandable";
import { SectionConfigSearch } from "./SectionConfigSearch";

export function OutputsSearch({ sectionId }) {
  const outputGroups = useAllOutputNames();
  const selected = useGetSectionInfo(sectionId, "outputGroup");

  function onSelectionChange({ id, newValueFn }) {
    setSectionInfoAttr({
      sectionId,
      attr: "outputGroup",
      newValueFn,
    });
    setSectionName(sectionId, outputGroups[id].name);
    const currSize = useSectionInfos.getState().x[sectionId].size;
    if (
      currSize.width < INITIAL_CHART_SIZE.width ||
      currSize.height < INITIAL_CHART_SIZE.height
    ) {
      setSectionSize(sectionId, INITIAL_CHART_SIZE);
    }
    maybeIncrementProjectStateVersion(true);
  }

  return (
    <SectionConfigSearch
      sectionId={sectionId}
      onSelectionChange={onSelectionChange}
      onSearch={() => {}}
      selected={[selected]}
      results={outputGroups}
      isCheckbox={false}
      DetailsComponent={OutputDetails}
    />
  );
}

function OutputDetails({ children, details, name }) {
  return (
    <Expandable heading={children} value={name} defaultValue={0}>
      {details.map((k) => (
        <div key={`OutputDetails-${k}`}>
          <p className="text-sm font-bold">{k}</p>
        </div>
      ))}
    </Expandable>
  );
}
