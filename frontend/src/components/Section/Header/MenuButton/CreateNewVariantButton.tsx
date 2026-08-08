import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { createNewSectionVariant } from "openapi/http";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
export function CreateNewVariantButton({ sectionId }) {
  async function onClick() {
    callOpenAPI(
      createNewSectionVariant({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
        },
      } as Parameters<typeof createNewSectionVariant>[0]),
    );
  }
  return <MenuItem onClick={onClick}>New Variant</MenuItem>;
}
