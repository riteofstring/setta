import * as Collapsible from "@radix-ui/react-collapsible";
import { useAllOutputNames } from "hooks/useOutputNames";
import { useGetSectionTypeConfig } from "hooks/useSectionType";
import { useSectionInfos } from "models/info/sectionInfos";
import { setSectionName, setSectionSize } from "thunks/sections/sections";
import { setSectionUITypeConfig } from "thunks/uiTypes";
import { INITIAL_CHART_SIZE } from "utils/constants";
import { SectionConfigSearch } from "./SectionConfigSearch";

export function OutputsSearch({ sectionId }) {
  const outputGroups = useAllOutputNames();
  const selected = useGetSectionTypeConfig(sectionId, "outputGroup");

  function onSelectionChange({ id, newValueFn }) {
    setSectionUITypeConfig({
      sectionId,
      configProps: { configName: "outputGroup", newValueFn },
    });
    setSectionName(sectionId, outputGroups[id].name);
    const currSize = useSectionInfos.getState().x[sectionId].size;
    if (
      currSize.width < INITIAL_CHART_SIZE.width ||
      currSize.height < INITIAL_CHART_SIZE.height
    ) {
      setSectionSize(sectionId, INITIAL_CHART_SIZE);
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

function OutputDetails({ children, details }) {
  return (
    <Collapsible.Root>
      <Collapsible.Trigger asChild>{children}</Collapsible.Trigger>
      <Collapsible.Content>
        <div className="mt-2 select-text rounded-md bg-slate-200 py-3 px-5">
          {details.map((k) => (
            <div key={`OutputDetails-${k}`}>
              <h3 className="text-sm font-bold">{k}</h3>
            </div>
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
