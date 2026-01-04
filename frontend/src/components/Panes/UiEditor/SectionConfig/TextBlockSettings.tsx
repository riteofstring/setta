import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import { setCurrEffectiveSectionImplValue } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useTextBlockTextAndEditability } from "state/hooks/sectionVariants";
import { useShareCapabilities } from "state/hooks/share";
import { res200 } from "utils/endpointUtils";
import { route_docstring_to_markdown } from "utils/generatedEndpoints";
import { TextBlockFormatEnum } from "utils/generatedTypes";

export function TextBlockSettings({ sectionId }: { sectionId: string }) {
  const { format, text, isFrozen, headingAsSectionName } =
    useTextBlockTextAndEditability(sectionId);
  const { canEditLayout, canEditParams } = useShareCapabilities();
  const canToggleFormat = canEditLayout && canEditParams;
  const canToggleHeading = canEditLayout;

  async function onChangeRenderMarkdown(v: boolean) {
    if (!canToggleFormat) {
      return;
    }
    let newText;
    if (v) {
      const res = await route_docstring_to_markdown({ docstring: text });
      newText = res200(res) ? res.data : text;
    } else {
      newText = text;
    }
    useProjectState.setState((state) => {
      setCurrEffectiveSectionImplValue<"TextBlockSection">(state, sectionId, {
        text: newText,
        format: v
          ? TextBlockFormatEnum.Markdown
          : TextBlockFormatEnum.Plaintext,
      });
    });
  }

  async function onChangeHeadingAsSectionName(v: boolean) {
    if (!canToggleHeading) {
      return;
    }
    useProjectState.setState((state) => {
      setCurrEffectiveSectionImplValue<"TextBlockSection">(state, sectionId, {
        headingAsSectionName: v,
      });
    });
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full items-center justify-between gap-4">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Markdown
        </p>
        <SwitchInput
          isDisabled={isFrozen || !canToggleFormat}
          value={format === TextBlockFormatEnum.Markdown}
          onChange={onChangeRenderMarkdown}
          outerDivClassName="flex items-center"
        />
      </div>
      <div className="flex w-full items-center justify-between gap-4">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Heading As Section Name
        </p>
        <SwitchInput
          isDisabled={isFrozen || !canToggleHeading}
          value={headingAsSectionName} // Add your state value
          onChange={onChangeHeadingAsSectionName} // Add your onChange handler
          outerDivClassName="flex items-center"
        />
      </div>
    </div>
  );
}
