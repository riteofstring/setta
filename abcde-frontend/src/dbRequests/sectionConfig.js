import axios from "axios";
import _ from "lodash";
import { BACKEND, NO_AUTH } from "utils/constants";
import {
  noAuthGetCollectionDetails,
  noAuthGetCollectionsAndModules,
} from "./noAuth/sectionConfig";

function searchCollectionsInMemory({ allCollections, searchTerm }) {
  if (!searchTerm) {
    return allCollections;
  }
  return _.pickBy(allCollections, (x) => x.name.includes(searchTerm));
}

export async function getCollectionsAndModules({ allCollections, searchTerm }) {
  if (NO_AUTH) {
    return await noAuthGetCollectionsAndModules({
      allCollections,
      searchTerm,
      searchCollectionsInMemory,
    });
  }

  const searchResults = axios
    .post(BACKEND + "codeInfo/getCollectionsAndModules", { searchTerm })
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return {};
    });

  return {
    ...searchResults,
    ...searchCollectionsInMemory({ allCollections, searchTerm }),
  };
}

export async function getCollectionDetails(id) {
  if (NO_AUTH) {
    return await noAuthGetCollectionDetails(id);
  }

  return axios
    .post(BACKEND + "codeInfo/getCollectionDetails", { codeInfoId: id })
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return {};
    });
}
