import { NULL_OBJ_ID } from "../constants";
import { SectionConfigType } from "../types/sectionConfig";
import { maybeNewId } from "../utils";

export function newSectionConfig({
  id,
  uiTypeId,
  evColId,
  kwargColId,
  selectedItem = NULL_OBJ_ID,
}: Partial<SectionConfigType>): SectionConfigType {
  return {
    id: maybeNewId(id),
    uiTypeId: maybeNewId(uiTypeId),
    evColId: maybeNewId(evColId),
    kwargColId: maybeNewId(kwargColId),
    selectedItem,
  };
}
