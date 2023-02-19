import * as Collapsible from "@radix-ui/react-collapsible";
import { useAllOutputNames } from "hooks/useOutputNames";
import { useGetSelectedOutputNames } from "hooks/useSectionContents";
import { useSectionInfos } from "models/info/sectionInfos";
import { setSectionUITypeConfig } from "thunks/uiTypes";
import { INITIAL_CHART_SIZE } from "utils/constants";
import { SectionConfigSearch } from "./SectionConfigSearch";

export function OutputsSearch({ sectionId }) {
  const outputGroups = useAllOutputNames();
  const alreadySelected = useGetSelectedOutputNames(sectionId);

  async function onSelectionChange({ id, newValueFn }) {
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
      alreadySelected={alreadySelected}
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
