import { useHomePageSearch } from "state/definitions/useHomePageSearch";

export function setHomePageSearch(value) {
  useHomePageSearch.setState({ value });
}
