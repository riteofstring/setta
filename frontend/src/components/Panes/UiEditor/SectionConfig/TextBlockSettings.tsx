import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useTextBlockTextAndEditability } from "state/hooks/sectionVariants";
import { res200 } from "utils/endpointUtils";
import {
  route_docstring_to_markdown,
  route_set_text_block_meta_control_style,
} from "utils/generatedEndpoints";
import { TextBlockFormatEnum } from "utils/generatedTypes";

export function TextBlockSettings({ sectionId }) {
  const { format, text, isFrozen, headingAsSectionName, metaControlStyle } =
    useTextBlockTextAndEditability(sectionId);

  async function onChangeRenderMarkdown(v: boolean) {
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
    useProjectState.setState((state) => {
      setCurrEffectiveSectionImplValue<"TextBlockSection">(state, sectionId, {
        headingAsSectionName: v,
      });
    });
  }

  function onChangeMetaControlStyle(v: boolean) {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"TextBlockSection">(state, sectionId, {
          metaControlStyle: v,
        });
      },
      send: (frontendOpId) =>
        route_set_text_block_meta_control_style({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          metaControlStyle: v,
          frontendOpId,
        }),
    });
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full items-center justify-between gap-4">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Markdown
        </p>
        <SwitchInput
          isDisabled={isFrozen}
          value={format === TextBlockFormatEnum.Markdown}
          onChange={onChangeRenderMarkdown}
          outerDivClassName="flex items-center"
        />
      </div>
      <div className="flex w-full items-center justify-between gap-4">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Heading as Section Name
        </p>
        <SwitchInput
          isDisabled={isFrozen}
          value={headingAsSectionName} // Add your state value
          onChange={onChangeHeadingAsSectionName} // Add your onChange handler
          outerDivClassName="flex items-center"
        />
      </div>
      <div className="flex w-full items-center justify-between gap-4">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Transparent Section
        </p>
        <SwitchInput
          isDisabled={isFrozen}
          value={metaControlStyle}
          onChange={onChangeMetaControlStyle}
          outerDivClassName="flex items-center"
        />
      </div>
    </div>
  );
}
