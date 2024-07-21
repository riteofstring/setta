import { useState } from "react";
import { setSectionInfoAttr } from "state/actions/sectionInfos";
import { setSectionSize } from "state/actions/setters";
import { useGetSectionInfo } from "state/hooks";
import {
  linkIsTwitter,
  youtubeSectionAspectRatio,
} from "state/hooks";

export function SocialTypeSearch({ sectionId }) {
  const url = useGetSectionInfo(sectionId, "social");
  const [value, setValue] = useState(url ?? "");
  function onBlur() {
    setSectionInfoAttr({ sectionId, attr: "social", value });

    const width = 550;
    const height = linkIsTwitter(value)
      ? "auto"
      : 500 * (1 / youtubeSectionAspectRatio);
    setSectionSize(sectionId, { width, height });
  }

  return (
    <div className="mb-2 mt-2 w-full select-text">
      <div className="flex w-full items-center gap-3">
        <p className="select-none text-sm font-bold">{"Social Media URL"}</p>
        <input
          className=" w-full rounded-full bg-white px-4 py-1 text-sm ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 dark:bg-setta-900"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={onBlur}
          placeholder={"https://www.youtube.com/"}
        />
      </div>
    </div>
  );
}
