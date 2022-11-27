import axios from "axios";
import { findAllDescendants, getCollections } from "classes/infoFactory";
import _ from "lodash";
import { BACKEND, NO_AUTH } from "utils/constants";
import { loadSpecificTestData } from "__tests__utils/loadTestData";

function searchCollectionsInMemory({ allCollections, searchTerm }) {
  return _.pickBy(allCollections, (x) => x.name.includes(searchTerm));
}

export async function getCollectionsAndModules({ allCollections, searchTerm }) {
  let searchResults = null;
  if (NO_AUTH) {
    const testData = await loadSpecificTestData({ name: "AllCodeInfo" });
    const collections = getCollections(testData);
    searchResults = _.pickBy(collections, (x) => x.name.includes(searchTerm));
  } else {
    searchResults = axios
      .post(BACKEND + "codeInfo/getCollectionsAndModules", { searchTerm })
      .then((res) => {
        return res.data;
      })
      .catch(() => {
        return {};
      });
  }
  return {
    ...searchResults,
    ...searchCollectionsInMemory({ allCollections, searchTerm }),
  };
}

export async function getCollectionDetails(id) {
  if (NO_AUTH) {
    const allCodeInfo = await loadSpecificTestData({ name: "AllCodeInfo" });
    const collection = allCodeInfo[id];
    let allDescendants = findAllDescendants(
      allCodeInfo,
      [id],
      null,
      () => true
    );
    allDescendants = _.keyBy(allDescendants, "id");
    return { ...allDescendants, [id]: collection };
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
