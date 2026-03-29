import { useLocalStorage, useTemporaryMiscState } from "state/definitions";
import { getSectionStylePreviewColorKey } from "utils/constants";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { LiveDictAreaPixiValueOverlaySceneRow } from "./LiveDictAreaPixiValueOverlaySceneRow";
import type { LiveDictAreaPixiValueRowTarget } from "./liveDictAreaPixiValueRowTargets";
import {
  type ParamEditorKind,
  PixiOverlayParamEditorKindProvider,
} from "./paramEditorActivation";

type LiveDictAreaPixiValueRowOverlayProps = {
  editorKind: ParamEditorKind;
  target: LiveDictAreaPixiValueRowTarget;
};

export function LiveDictAreaPixiValueRowOverlay({
  editorKind,
  target,
}: LiveDictAreaPixiValueRowOverlayProps) {
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
          <LiveDictAreaPixiValueOverlaySceneRow
            hasSectionStyleTheme={hasSectionStyleTheme}
            target={target}
          />
        </div>
      </div>
    </PixiOverlayParamEditorKindProvider>
  );
}
