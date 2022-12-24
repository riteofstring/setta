import { SectionConfigType } from "../types/sectionConfig";
import { maybeNewId } from "../utils";

export function newSectionConfig({
  uiTypeId,
  evColId,
  kwargColId,
  selectedItem = null,
}: Partial<SectionConfigType>): SectionConfigType {
  return {
    uiTypeId: maybeNewId(uiTypeId),
    evColId: maybeNewId(evColId),
    kwargColId: maybeNewId(kwargColId),
    selectedItem,
  };
}
