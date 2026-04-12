import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import {
  docstringToMarkdown,
  setTextBlockHeadingAsSectionName,
  setTextBlockMasterFontSize,
  setTextBlockMetaControlStyle,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
} from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState, useShareSession } from "state/definitions";
import { useTextBlockTextAndEditability } from "state/hooks/sectionVariants";
import { useShareCapabilities } from "state/hooks/share";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import { TextBlockFormatEnum } from "utils/generatedTypes";
import { clampTextBlockMasterFontSize } from "utils/textBlockTypography";
type TextBlockSettingsProps = {
  sectionId: string;
};
type DocstringToMarkdownRouteResponse = ResponseDataAndStatus<string>;
export function TextBlockSettings({ sectionId }: TextBlockSettingsProps) {
  const {
    format,
    text,
    isFrozen,
    headingAsSectionName,
    metaControlStyle,
    masterFontSizePx,
  } = useTextBlockTextAndEditability(sectionId);
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const { canEditParams } = useShareCapabilities();
  const canToggleFormat = !isDeploymentMode || canEditParams;
  const canToggleHeading = !isDeploymentMode || canEditParams;
  const canToggleMetaControlStyle = !isDeploymentMode || canEditParams;
  const [masterFontSizeDraft, setMasterFontSizeDraft] =
    useState(masterFontSizePx);
  const isMasterFontSizeDraggingRef = useRef(false);
  useEffect(() => {
    if (isMasterFontSizeDraggingRef.current) {
      return;
    }
    setMasterFontSizeDraft(masterFontSizePx);
  }, [masterFontSizePx]);
  async function onChangeRenderMarkdown(v: boolean) {
    if (!canToggleFormat) {
      return;
    }
    let newText = text;
    if (v) {
      const res = (await callOpenAPI(
        docstringToMarkdown({
          body: { docstring: text },
        } as Parameters<typeof docstringToMarkdown>[0]),
      )) as DocstringToMarkdownRouteResponse;
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
        callOpenAPI(
          setTextBlockHeadingAsSectionName({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              headingAsSectionName: v,
              frontendOpId,
            },
          } as Parameters<typeof setTextBlockHeadingAsSectionName>[0]),
        ),
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
        callOpenAPI(
          setTextBlockMetaControlStyle({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              metaControlStyle: v,
              frontendOpId,
            },
          } as Parameters<typeof setTextBlockMetaControlStyle>[0]),
        ),
    });
  }
  function updateMasterFontSize(v: number) {
    if (!canToggleMetaControlStyle) {
      return;
    }
    const clamped = clampTextBlockMasterFontSize(v);
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"TextBlockSection">(state, sectionId, {
          masterFontSizePx: clamped,
        });
      },
      send: (frontendOpId) =>
        callOpenAPI(
          setTextBlockMasterFontSize({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              masterFontSizePx: clamped,
              frontendOpId,
            },
          } as Parameters<typeof setTextBlockMasterFontSize>[0]),
        ),
    });
  }
  function onMasterFontSizeDragStart() {
    isMasterFontSizeDraggingRef.current = true;
  }
  function onMasterFontSizeInput(v: number) {
    const clamped = clampTextBlockMasterFontSize(v);
    setMasterFontSizeDraft(clamped);
    if (!isMasterFontSizeDraggingRef.current) {
      updateMasterFontSize(clamped);
    }
  }
  function onMasterFontSizeDragEnd(
    event: PointerEvent<HTMLInputElement> | FocusEvent<HTMLInputElement>,
  ) {
    if (!isMasterFontSizeDraggingRef.current) {
      return;
    }
    isMasterFontSizeDraggingRef.current = false;
    const clamped = clampTextBlockMasterFontSize(
      Number(event.currentTarget.value),
    );
    setMasterFontSizeDraft(clamped);
    updateMasterFontSize(clamped);
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
      <div className="flex w-full flex-col gap-2 rounded-md border border-setta-200/60 p-2 dark:border-setta-700/60">
        <div className="flex w-full items-center justify-between gap-4">
          <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
            Master Font Size
          </p>
          <span className="font-mono text-[11px] text-setta-500 dark:text-setta-400">
            {masterFontSizeDraft.toFixed(0)}px
          </span>
        </div>
        <input
          type="range"
          min={8}
          max={48}
          step={1}
          value={masterFontSizeDraft}
          onChange={(event) =>
            onMasterFontSizeInput(Number(event.currentTarget.value))
          }
          onPointerDown={onMasterFontSizeDragStart}
          onPointerUp={onMasterFontSizeDragEnd}
          onPointerCancel={onMasterFontSizeDragEnd}
          onBlur={onMasterFontSizeDragEnd}
          disabled={isFrozen || !canToggleMetaControlStyle}
          className="w-full accent-blue-500"
        />
      </div>
    </div>
  );
}
