import axios from "axios";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { BACKEND, NO_AUTH } from "utils/constants";
import {
  noAuthGetCollectionDetails,
  noAuthGetCollectionsAndModules,
} from "./noAuth/sectionConfig";

function searchCollectionsInMemory({ searchTerm }) {
  const allCollections = useCodeInfo.getState().allCollections;
  if (!searchTerm) {
    return allCollections;
  }
  return _.pickBy(allCollections, (x) => x.name.includes(searchTerm));
}

export async function getCollectionsAndModules({ searchTerm }) {
  if (NO_AUTH) {
    return await noAuthGetCollectionsAndModules({
      searchTerm,
      searchCollectionsInMemory,
    });
  }

  return axios
    .post(BACKEND + "codeInfo/getCollectionsAndModules", { searchTerm })
    .then((res) => {
      return {
        ...res.data,
        ...searchCollectionsInMemory({ searchTerm }),
      };
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
    results = axios
      .post(BACKEND + "codeInfo/getCollectionDetails", { codeInfoId: id })
      .then((res) => {
        return res.data;
      })
      .catch(() => {
        return {};
      });
  }

  s.updateCodeInfo(results);
}
