import { useHomePageSearch } from "state/definitions";

export function setHomePageSearch(value) {
  useHomePageSearch.setState({ value });
}
