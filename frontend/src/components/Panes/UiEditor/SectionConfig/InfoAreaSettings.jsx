import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import _ from "lodash";
import { dbDocstringToMarkdown } from "requests/codeInfo";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useSectionInfos } from "state/definitions";

export function InfoAreaSettings({ sectionId }) {
  const { renderMarkdown, description } = useSectionInfos((x) =>
    _.pick(x.x[sectionId], ["renderMarkdown", "description"]),
  );

  async function onChange(v) {
    let newDescription;
    if (v) {
      const res = await dbDocstringToMarkdown(description);
      newDescription = res.status === 200 ? res.data : description;
    } else {
      newDescription = description;
    }
    setSectionInfoAttr({
      sectionId,
      attr: "description",
      value: newDescription,
    });
    setSectionInfoAttr({
      sectionId,
      attr: "renderMarkdown",
      value: v,
    });
  }

  return (
    <div className="flex items-center gap-4">
      <p className="text-sm font-medium leading-none">Render Markdown</p>
      <SwitchInput
        value={renderMarkdown}
        onChange={onChange}
        outerDivClassName="flex items-center"
      />
    </div>
  );
}
