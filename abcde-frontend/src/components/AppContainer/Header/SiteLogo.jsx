import { Link } from "react-router-dom";

export function SiteLogo() {
  return (
    <Link to="/">
      <h2 className="mr-4 cursor-pointer select-none font-logo text-lg font-semibold tracking-tighter text-slate-600 no-underline">
        <span className="text-[#00B5D8]">run</span>
        coder
      </h2>
    </Link>
  );
}
