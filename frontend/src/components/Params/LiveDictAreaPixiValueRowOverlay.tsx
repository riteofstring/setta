import type { LiveDictAreaPixiValueOverlayRowState } from "./liveDictAreaPixiValueOverlayRowState";
import { LiveDictAreaPixiValueOverlaySceneRow } from "./LiveDictAreaPixiValueOverlaySceneRow";
import type { LiveDictAreaPixiValueRowTarget } from "./liveDictAreaPixiValueRowTargets";
import {
  type ParamEditorKind,
  PixiOverlayParamEditorKindProvider,
} from "./paramEditorActivation";

type LiveDictAreaPixiValueRowOverlayProps = {
  editorKind: ParamEditorKind;
  hasSectionStyleTheme: boolean;
  rowState: LiveDictAreaPixiValueOverlayRowState;
  target: LiveDictAreaPixiValueRowTarget;
};

export function LiveDictAreaPixiValueRowOverlay({
  editorKind,
  hasSectionStyleTheme,
  rowState,
  target,
}: LiveDictAreaPixiValueRowOverlayProps) {
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
            rowState={rowState}
            target={target}
          />
        </div>
      </div>
    </PixiOverlayParamEditorKindProvider>
  );
}
