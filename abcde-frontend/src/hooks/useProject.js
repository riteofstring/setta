import { useStoreState } from "easy-peasy";

export function useProjectToLoad() {
  const idToLoad = useStoreState((x) => x.projectToLoad.id);
  const configIdToLoad = useStoreState((x) => x.projectToLoad.configId);
  return { idToLoad, configIdToLoad };
}

export function useCurrProjectId() {
  const id = useStoreState((x) => x.project.id);
  const configId = useStoreState((x) => x.projectConfig.id);
  return { id, configId };
}
