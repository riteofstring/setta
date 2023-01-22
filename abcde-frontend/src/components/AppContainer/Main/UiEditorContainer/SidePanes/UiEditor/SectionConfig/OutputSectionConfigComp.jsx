import * as Collapsible from "@radix-ui/react-collapsible";
import { useOutputNames } from "hooks/useOutputNames";
import { useGetSelectedOutputs } from "hooks/useSectionContents";
import { setSectionUITypeConfig } from "thunks/uiTypes";
import { SectionConfigSearch } from "./SectionConfigComp";

export function OutputsSearch({ sectionId }) {
  const outputGroups = useOutputNames();
  const alreadySelected = useGetSelectedOutputs(sectionId);

  async function onSelectionChange({ newValueFn }) {
    setSectionUITypeConfig({
      sectionId,
      configProps: { configName: "outputGroups", newValueFn },
    });
  }

  return (
    <SectionConfigSearch
      sectionId={sectionId}
      onSelectionChange={onSelectionChange}
      onSearch={() => {}}
      alreadySelected={alreadySelected}
      results={outputGroups}
      DetailsComponent={OutputDetails}
    />
  );
}

function OutputDetails({ children, details }) {
  return (
    <Collapsible.Root>
      <Collapsible.Trigger asChild>{children}</Collapsible.Trigger>
      <Collapsible.Content>
        <div className="py-3 px-5 mt-2 bg-gray-200 rounded-md select-text">
          {details.map((k) => (
            <div key={`OutputDetails-${k}`}>
              <h3 className="font-bold text-sm">{k}</h3>
            </div>
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
