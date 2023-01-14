import { useCurrPage } from "models/currPage";
import { HOME } from "utils/pageNames";

export function SiteLogo() {
  const setCurrPage = useCurrPage((x) => x.setName);
  return (
    <h2
      className="no-underline select-none cursor-pointer text-gray-600 tracking-tight text-lg font-semibold font-logo"
      onClick={() => setCurrPage(HOME)}
    >
      <span className="text-[#00B5D8]">run</span>
      coder
    </h2>
  );
}
