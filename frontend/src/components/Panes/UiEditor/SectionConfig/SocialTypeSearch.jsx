import { useState } from "react";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { setAspectRatioInfo, setSectionSize } from "state/actions/sections/setters";
import { useGetSectionInfo } from "state/hooks/sections";

export function SocialTypeSearch({ sectionId }) {
  const url = useGetSectionInfo(sectionId, "social");
  console.log("url", url);
  const [value, setValue] = useState(url ?? "");
  function onBlur(e) {
    const blurValue = e.target.value;
    if (blurValue) {
      setSectionInfoAttr({ sectionId, attr: "social", value: blurValue });
      let size = { width: 640, height: 360+24 };
      // size = adjustAspectRatio(size.height, size.width, 9, 16);
      // const sectionHeaderHeight = 28;
      // size.height += sectionHeaderHeight;
      // console.log("size", size)
      setSectionSize(sectionId, size);
      setAspectRatioInfo({
        sectionId,
        aspectRatio: 16 / 9,
        aspectRatioExtraHeight: 24,
      });

      // const width = 550;
      // const height = linkIsTwitter(blurValue)
      //   ? "auto"
      //   : 500 * (1 / youtubeSectionAspectRatio);
      // setSectionSize(sectionId, { width, height });
      // setAspectRatioInfo({ sectionId, aspectRatio: youtubeSectionAspectRatio });
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
