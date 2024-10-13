import { useState } from "react";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useGetSectionInfo } from "state/hooks/sections";

export function SocialAreaSettings({ sectionId }) {
  const url = useGetSectionInfo(sectionId, "social");
  console.log("url", url);
  const [value, setValue] = useState(url ?? "");
  function onBlur(e) {
    const blurValue = e.target.value;
    if (blurValue) {
      setSectionInfoAttr({ sectionId, attr: "social", value: blurValue });
    }
  }

  return (
    <div className="mb-2 mt-2 w-full select-text">
      <div className="flex w-full items-center gap-3">
        <p className="select-none text-sm font-bold">Social Media URL</p>
        <input
          className=" w-full rounded-full bg-white px-4 py-1 text-sm ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 dark:bg-setta-900"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={onBlur}
          placeholder="https://www.youtube.com/"
        />
      </div>
    </div>
  );
}
