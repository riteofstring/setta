import { router } from "utils/Routes/router";

export function SiteLogo() {
  return (
    <h2
      className="cursor-pointer select-none font-logo text-lg font-semibold tracking-tighter text-slate-600 no-underline"
      onClick={() => router.navigate("/")}
    >
      <span className="text-[#00B5D8]">run</span>
      coder
    </h2>
  );
}
