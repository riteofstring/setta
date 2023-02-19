import { useAllOutputNames } from "hooks/useOutputNames";
import { useGetSectionTypeConfig } from "hooks/useSectionType";
import { useSectionInfos } from "models/info/sectionInfos";
import { setSectionUITypeConfig } from "thunks/uiTypes";
import { INITIAL_CHART_SIZE } from "utils/constants";
import { Expandable } from "./Expandable";
import { SectionConfigSearch } from "./SectionConfigSearch";

export function OutputsSearch({ sectionId }) {
  const outputGroups = useAllOutputNames();
  const selected = useGetSectionTypeConfig(sectionId, "outputGroup");

  function onSelectionChange({ id, newValueFn }) {
    setSectionUITypeConfig({
      sectionId,
      configProps: { configName: "outputGroup", newValueFn },
    });
    const s = useSectionInfos.getState();
    s.setSectionInfoAttr({
      sectionId,
      attr: "name",
      value: outputGroups[id].name,
    });
    const currSize = s.x[sectionId].size;
    if (
      currSize.width < INITIAL_CHART_SIZE.width ||
      currSize.height < INITIAL_CHART_SIZE.height
    ) {
      s.setSectionInfoAttr({
        sectionId,
        attr: "size",
        value: INITIAL_CHART_SIZE,
      });
    }
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
          <h3 className="text-sm font-bold">{k}</h3>
        </div>
      ))}
    </Expandable>
  );
}
