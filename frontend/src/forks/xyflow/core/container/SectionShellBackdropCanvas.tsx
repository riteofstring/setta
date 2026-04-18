import { useLayoutEffect, useMemo, useRef } from "react";
import { getCurrEffectiveSectionImplIfPresent } from "state/actions/sectionInfos";
import {
  useLocalStorage,
  useNodeInternals,
  useProjectState,
  useTemporaryMiscState,
  type ZustandNodeInternalsState,
} from "state/definitions";
import {
  getKwargsControlsHeightKey,
  getSectionHeaderHeightKey,
  getSectionSearchHeightKey,
} from "utils/constants";
import { shallow } from "zustand/shallow";
import { containerStyle } from "../styles";
import {
  buildSectionShellBackdropScene,
  expandSectionShellBackdropBounds,
  paintSectionShellBackdrop,
} from "./sectionShellBackdrop";
import {
  CANVAS_OWNED_SECTION_SHELL_ID,
  isCanvasOwnedSectionShell,
  resolveCanvasOwnedSectionShellChrome,
} from "./sectionShellCanvasOwnership";

const SHELL_BACKDROP_PADDING_PX = 24;
const CALLABLE_TOOLBAR_CORNER_RADIUS_PX = 12;

function normalizeStoredHeight(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(value, 0)
    : 0;
}

export default function SectionShellBackdropCanvas() {
  const nodes = useNodeInternals((state: ZustandNodeInternalsState) => state.x);
  const darkMode = useLocalStorage((state) => state.darkMode);
  const canvasOwnedShellStyleColor = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplIfPresent(
      state,
      CANVAS_OWNED_SECTION_SHELL_ID,
    );
    return typeof impl?.styleColor === "string" ? impl.styleColor : null;
  });
  const {
    canvasOwnedShellHeaderHeight,
    canvasOwnedShellKwargsControlsHeight,
    canvasOwnedShellSearchHeight,
  } = useTemporaryMiscState(
    (state) => ({
      canvasOwnedShellHeaderHeight: normalizeStoredHeight(
        state[getSectionHeaderHeightKey(CANVAS_OWNED_SECTION_SHELL_ID)],
      ),
      canvasOwnedShellKwargsControlsHeight: normalizeStoredHeight(
        state[getKwargsControlsHeightKey(CANVAS_OWNED_SECTION_SHELL_ID)],
      ),
      canvasOwnedShellSearchHeight: normalizeStoredHeight(
        state[getSectionSearchHeightKey(CANVAS_OWNED_SECTION_SHELL_ID)],
      ),
    }),
    shallow,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useMemo(
    () =>
      buildSectionShellBackdropScene(nodes.values(), {
        getFrameVisual: (node) => {
          if (!isCanvasOwnedSectionShell(node.id)) {
            return null;
          }

          const chrome = resolveCanvasOwnedSectionShellChrome({
            darkMode,
            styleColor: canvasOwnedShellStyleColor,
          });
          const callableToolbarOffsetY =
            canvasOwnedShellHeaderHeight + canvasOwnedShellSearchHeight;

          return {
            ...chrome,
            detailBands:
              canvasOwnedShellKwargsControlsHeight > 0
                ? [
                    {
                      cornerRadius: CALLABLE_TOOLBAR_CORNER_RADIUS_PX,
                      divider: chrome.callableToolbarDivider,
                      fill: chrome.callableToolbarFill,
                      height: canvasOwnedShellKwargsControlsHeight,
                      offsetY: callableToolbarOffsetY,
                    },
                  ]
                : null,
            headerHeight: canvasOwnedShellHeaderHeight,
          };
        },
      }),
    [
      canvasOwnedShellHeaderHeight,
      canvasOwnedShellKwargsControlsHeight,
      canvasOwnedShellSearchHeight,
      canvasOwnedShellStyleColor,
      darkMode,
      nodes,
    ],
  );

  const expandedBounds = useMemo(() => {
    return scene.bounds
      ? expandSectionShellBackdropBounds(
          scene.bounds,
          SHELL_BACKDROP_PADDING_PX,
        )
      : null;
  }, [scene.bounds]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || expandedBounds === null) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const devicePixelRatio =
      typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;

    canvas.width = Math.ceil(expandedBounds.width * devicePixelRatio);
    canvas.height = Math.ceil(expandedBounds.height * devicePixelRatio);
    canvas.style.width = `${expandedBounds.width}px`;
    canvas.style.height = `${expandedBounds.height}px`;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    paintSectionShellBackdrop(context, scene, {
      darkMode,
      padding: SHELL_BACKDROP_PADDING_PX,
    });
  }, [darkMode, expandedBounds, scene]);

  if (expandedBounds === null) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="react-flow__section-shell-backdrop"
      style={containerStyle}
    >
      <canvas
        data-testid="react-flow__section-shell-backdrop-canvas"
        ref={canvasRef}
        style={{
          left: `${expandedBounds.x}px`,
          pointerEvents: "none",
          position: "absolute",
          top: `${expandedBounds.y}px`,
        }}
      />
    </div>
  );
}
