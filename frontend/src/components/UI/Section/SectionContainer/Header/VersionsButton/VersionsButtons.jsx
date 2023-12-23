import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useGetEVColNames } from "hooks/useEnteredValue";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { TbVersions } from "react-icons/tb";
import { setSectionInfoAttr } from "thunks/sections/setters";
import { Badge } from "utils/atoms/badges/badge";
import { Item } from "utils/atoms/dropdown/item";

export const VersionsButton = ({ sectionId }) => {
  return (
    <DropdownMenu.Root asChild>
      <DropdownMenu.Trigger className="place-items center nodrag grid  cursor-pointer rounded-full bg-transparent p-1 text-runcoder-300 transition-colors duration-150 hover:bg-runcoder-100 focus-visible:ring-2 dark:text-runcoder-400/50 dark:hover:bg-runcoder-900 dark:hover:text-runcoder-300">
        <TbVersions className="h-3 w-3" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          className="z-[1000] flex select-none flex-col gap-1 rounded-md bg-white py-2 px-4 drop-shadow dark:bg-runcoder-800"
        >
          <Items sectionId={sectionId} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

function Items({ sectionId }) {
  const currEVColId = useGetSectionInfo(sectionId, "evColId");
  const evColNames = useGetEVColNames(sectionId);
  function onMouseOver(id) {
    setSectionInfoAttr({ sectionId, attr: "evColId", value: id });
  }
  return evColNames.map((e) => (
    <OneItem
      key={e.id}
      evCol={e}
      currEVColId={currEVColId}
      onMouseOver={onMouseOver}
    />
  ));
}

function OneItem({ evCol, currEVColId, onMouseOver }) {
  return (
    <Item onMouseOver={() => onMouseOver(evCol.id)}>
      {currEVColId === evCol.id && (
        <Badge twClasses="bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100">
          {"✓"}
        </Badge>
      )}
      {evCol.name}
    </Item>
  );
}
