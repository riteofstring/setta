import { getCollectionsAndModules } from "dbRequests/sectionConfig";
import { useState } from "react";

export function useGetCollectionsAndModules() {
  const [results, setResults] = useState({});

  async function onSearch(searchTerm) {
    const x = await getCollectionsAndModules({ searchTerm });
    setResults(x);
  }

  return { results, onSearch };
}
