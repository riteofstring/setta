import { router } from "utils/Routes/router";

export function SiteLogo() {
  return (
    <h2
      className="no-underline select-none cursor-pointer text-gray-600 tracking-tight text-lg font-semibold font-logo"
      onClick={() => router.navigate("/")}
    >
      <span className="text-[#00B5D8]">run</span>
      coder
    </h2>
  );
}
