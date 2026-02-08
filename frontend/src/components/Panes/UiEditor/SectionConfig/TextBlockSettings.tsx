import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState, useShareSession } from "state/definitions";
import { useTextBlockTextAndEditability } from "state/hooks/sectionVariants";
import { useShareCapabilities } from "state/hooks/share";
import { res200 } from "utils/endpointUtils";
import {
  route_docstring_to_markdown,
  route_set_text_block_heading_as_section_name,
  route_set_text_block_meta_control_style,
} from "utils/generatedEndpoints";
import { TextBlockFormatEnum } from "utils/generatedTypes";

type TextBlockSettingsProps = {
  sectionId: string;
};

export function TextBlockSettings({ sectionId }: TextBlockSettingsProps) {
  const { format, text, isFrozen, headingAsSectionName, metaControlStyle } =
    useTextBlockTextAndEditability(sectionId);
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const { canEditParams } = useShareCapabilities();
  const canToggleFormat = !isDeploymentMode || canEditParams;
  const canToggleHeading = !isDeploymentMode || canEditParams;
  const canToggleMetaControlStyle = !isDeploymentMode || canEditParams;

  async function onChangeRenderMarkdown(v: boolean) {
    if (!canToggleFormat) {
      return;
    }
    let newText = text;
    if (v) {
      const res = await route_docstring_to_markdown({ docstring: text });
      if (res200(res)) {
        newText = res.data;
      }
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

  function onChangeHeadingAsSectionName(v: boolean) {
    if (!canToggleHeading) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"TextBlockSection">(state, sectionId, {
          headingAsSectionName: v,
        });
      },
      send: (frontendOpId) =>
        route_set_text_block_heading_as_section_name({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          headingAsSectionName: v,
          frontendOpId,
        }),
    });
  }

  function onChangeMetaControlStyle(v: boolean) {
    if (!canToggleMetaControlStyle) {
      return;
    }
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
          isDisabled={isFrozen || !canToggleFormat}
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
          isDisabled={isFrozen || !canToggleHeading}
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
          isDisabled={isFrozen || !canToggleMetaControlStyle}
          value={metaControlStyle}
          onChange={onChangeMetaControlStyle}
          outerDivClassName="flex items-center"
        />
      </div>
    </div>
  );
}
