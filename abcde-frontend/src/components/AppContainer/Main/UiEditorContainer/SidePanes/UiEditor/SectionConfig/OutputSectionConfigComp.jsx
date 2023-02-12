import * as Collapsible from "@radix-ui/react-collapsible";
import { useOutputNames } from "hooks/useOutputNames";
import { useGetSelectedOutputNames } from "hooks/useSectionContents";
import { setSectionUITypeConfig } from "thunks/uiTypes";
import { SectionConfigSearch } from "./SectionConfigComp";

export function OutputsSearch({ sectionId }) {
  const outputGroups = useOutputNames();
  const alreadySelected = useGetSelectedOutputNames(sectionId);

  async function onSelectionChange({ newValueFn }) {
    setSectionUITypeConfig({
      sectionId,
      configProps: { configName: "outputGroup", newValueFn },
    });
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
