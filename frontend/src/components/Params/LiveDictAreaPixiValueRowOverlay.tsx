import { getCurrEffectiveCodeObjImpl } from "state/actions/sectionInfos";
import {
  useLocalStorage,
  useProjectState,
  useTemporaryMiscState,
} from "state/definitions";
import { getSectionStylePreviewColorKey } from "utils/constants";
import { CodeObjTypeEnum } from "utils/generatedTypes";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { GetParamSwitch } from "./GetParamSwitch";
import type { LiveDictAreaPixiValueRowTarget } from "./liveDictAreaPixiValueRowTargets";
import {
  PixiOverlayParamEditorKindProvider,
  resolveParamEditorKind,
} from "./paramEditorActivation";

type LiveDictAreaPixiValueRowOverlayProps = {
  target: LiveDictAreaPixiValueRowTarget;
};

export function LiveDictAreaPixiValueRowOverlay({
  target,
}: LiveDictAreaPixiValueRowOverlayProps) {
  const editorKind = useProjectState((state) => {
    const codeObjImpl = getCurrEffectiveCodeObjImpl(
      state,
      target.sectionId,
      target.rowId,
    );
    return resolveParamEditorKind(codeObjImpl.type, {
      hasColorChoiceMenu:
        codeObjImpl.type === CodeObjTypeEnum.ColorPickerParam &&
        Array.isArray(codeObjImpl.colorChoices) &&
        codeObjImpl.colorChoices.length > 0,
    });
  });
  const darkMode = useLocalStorage((state) => state.darkMode);
  const styleColorPreviewKey = getSectionStylePreviewColorKey(target.sectionId);
  const previewStyleColor = useTemporaryMiscState(
    (state) => state[styleColorPreviewKey] as string | null | undefined,
  );
  const resolvedStyleColor =
    previewStyleColor === undefined ? target.styleColor : previewStyleColor;
  const hasSectionStyleTheme = Boolean(
    resolvedStyleColor
      ? deriveSectionStyleTheme(resolvedStyleColor, darkMode)
      : null,
  );

  return (
    <PixiOverlayParamEditorKindProvider value={editorKind}>
      <div
        className="pointer-events-auto absolute z-20"
        data-live-dict-area-editor-overlay="active"
        data-live-dict-area-editor-overlay-editor-kind={editorKind}
        data-live-dict-area-editor-overlay-kind="value-row"
        data-live-dict-area-editor-overlay-row-id={target.rowId}
        style={{
          left: target.x,
          minHeight: target.height,
          right: 0,
          top: target.y,
        }}
      >
        <div className="section-args-nested section-key-value section-min-rows grid min-h-0 w-full auto-rows-min content-start gap-y-1 pr-1.5">
          <GetParamSwitch
            sectionId={target.sectionId}
            paramIds={[target.rowId]}
            requiredParamIdsToPaths={target.requiredParamIdsToPaths}
            onResizeStart={target.handleColumnResizeStart}
            isTopLevel={true}
            listKey={target.listKey}
            hasSectionStyleTheme={hasSectionStyleTheme}
          />
        </div>
      </div>
    </PixiOverlayParamEditorKindProvider>
  );
}
