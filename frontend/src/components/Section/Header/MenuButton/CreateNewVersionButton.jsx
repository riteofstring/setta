import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import {
  createNewVersion,
  createNewVersionName,
  maybeSaveNewJSONVersion,
} from "state/actions/newVersion";
import { getSectionInfo } from "state/actions/sectionInfo";
import { useSectionInfos } from "state/definitions";

export function CreateNewVersionButton({ sectionId }) {
  async function onClick() {
    createNewVersionMaybeWithJSON(sectionId);
  }

  return <MenuItem onClick={onClick}>New Version</MenuItem>;
}

async function createNewVersionMaybeWithJSON(sectionId) {
  const { jsonSource } = getSectionInfo(sectionId);
  const newVersionName = await createNewVersionName(jsonSource);
  useSectionInfos.setState((state) => {
    createNewVersion(sectionId, newVersionName, state);
  });
  maybeSaveNewJSONVersion(sectionId, jsonSource);
}
