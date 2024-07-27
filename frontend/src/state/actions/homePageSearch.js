import { useHomePageSearch } from "state/definitions/homePageSearch";

export function setHomePageSearch(value) {
  useHomePageSearch.setState({ value });
}
