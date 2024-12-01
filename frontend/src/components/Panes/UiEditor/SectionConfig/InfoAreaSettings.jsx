import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import { dbDocstringToMarkdown } from "requests/codeInfo";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { setSectionVariantAttr } from "state/actions/sectionVariants";
import { useSectionInfos } from "state/definitions";
import { useSectionDescription } from "state/hooks/sectionVariants";

export function InfoAreaSettings({ sectionId }) {
  const renderMarkdown = useSectionInfos((x) => x.x[sectionId].renderMarkdown);
  const description = useSectionDescription(sectionId);

  async function onChange(v) {
    let newDescription;
    if (v) {
      const res = await dbDocstringToMarkdown(description);
      newDescription = res.status === 200 ? res.data : description;
    } else {
      newDescription = description;
    }
    setSectionVariantAttr(sectionId, "description", newDescription);
    setSectionInfoAttr({
      sectionId,
      attr: "renderMarkdown",
      value: v,
    });
  }

  return (
    <div className="flex w-full items-center justify-between gap-4 ">
      <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
        Render Markdown
      </p>
      <SwitchInput
        value={renderMarkdown}
        onChange={onChange}
        outerDivClassName="flex items-center"
      />
    </div>
  );
}
