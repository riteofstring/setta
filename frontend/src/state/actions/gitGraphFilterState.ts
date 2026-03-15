import { useGitStore } from "state/git";

export function setGitGraphFilterText(filterText: string): void {
  useGitStore.setState((state) => {
    if (!state.graph) {
      return state;
    }
    return {
      ...state,
      graph: { ...state.graph, filterText },
    };
  });
}
