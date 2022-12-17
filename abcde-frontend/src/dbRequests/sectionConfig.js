import axios from "axios";
import { useCodeInfo } from "models/info/codeInfo";
import { BACKEND, NO_AUTH } from "utils/constants";
import {
  noAuthGetCollectionDetails,
  noAuthGetCollectionsAndModules,
} from "./noAuth/sectionConfig";

export async function getCollectionsAndModules({ searchTerm }) {
  if (NO_AUTH) {
    return await noAuthGetCollectionsAndModules({ searchTerm });
  }

  return axios
    .post(BACKEND + "codeInfo/getCollectionsAndModules", { searchTerm })
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return {};
    });
}

export async function getCollectionDetails(id) {
  const s = useCodeInfo.getState();
  if (id in s.allCollections) {
    return;
  }

  let results;
  if (NO_AUTH) {
    results = await noAuthGetCollectionDetails(id);
  } else {
    results = await axios
      .post(BACKEND + "codeInfo/getCollectionDetails", { codeInfoId: id })
      .then((res) => {
        return res.data;
      })
      .catch(() => {
        return {};
      });
  }

  s.updateInfos(results);
}
