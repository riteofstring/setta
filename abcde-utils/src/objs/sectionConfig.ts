import { SectionConfigType } from "../types/sectionConfig";
import { maybeNewId } from "../utils";

export function newSectionConfig({
  id,
  uiTypeId,
  evColId,
  kwargColId,
  selectedItem = null,
}: Partial<SectionConfigType>): SectionConfigType {
  return {
    id: maybeNewId(id),
    uiTypeId: maybeNewId(uiTypeId),
    evColId: maybeNewId(evColId),
    kwargColId: maybeNewId(kwargColId),
    selectedItem,
  };
}
