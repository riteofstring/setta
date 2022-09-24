import { useStoreActions } from "easy-peasy";

export function useProjectLoader() {
  const loadSections = useStoreActions((x) => x.master.loadSections);

  return (data) => {
    loadSections(data);
  };
}
