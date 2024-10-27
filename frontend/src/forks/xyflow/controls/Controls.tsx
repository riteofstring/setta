import cc from "classcat";
import { zoomIn, zoomOut } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { fitView } from "forks/xyflow/core/store/utils";
import {
  memo,
  useEffect,
  useState,
  type FC,
  type PropsWithChildren,
} from "react";
import { useSettings } from "state/definitions";
import { shallow } from "zustand/shallow";
import Panel from "../core/components/Panel";
import ControlButton from "./ControlButton";
import FitviewIcon from "./Icons/FitView";
import LockIcon from "./Icons/Lock";
import MinusIcon from "./Icons/Minus";
import PlusIcon from "./Icons/Plus";
import UnlockIcon from "./Icons/Unlock";
import type { ControlProps } from "./types";

function useZoomReached() {
  const { minZoom, maxZoom } = useSettings(
    (x) => ({
      minZoom: x.minZoom,
      maxZoom: x.maxZoom,
    }),
    shallow,
  );
  return useReactFlow(
    (x) => ({
      minZoomReached: x.transform[2] <= minZoom,
      maxZoomReached: x.transform[2] >= maxZoom,
    }),
    shallow,
  );
}

const Controls: FC<PropsWithChildren<ControlProps>> = ({
  style,
  showZoom = true,
  showFitView = true,
  showInteractive = true,
  fitViewOptions,
  onZoomIn,
  onZoomOut,
  onFitView,
  onInteractiveChange,
  className,
  children,
  position = "bottom-left",
}) => {
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const { minZoomReached, maxZoomReached } = useZoomReached();
  const isInteractive = useReactFlow(
    (s) => s.nodesDraggable || s.elementsSelectable,
    shallow,
  );
  useEffect(() => {
    setIsVisible(true);
  }, []);

  if (!isVisible) {
    return null;
  }

  const onZoomInHandler = () => {
    zoomIn();
    onZoomIn?.();
  };

  const onZoomOutHandler = () => {
    zoomOut();
    onZoomOut?.();
  };

  const onFitViewHandler = () => {
    fitView(useReactFlow.getState, fitViewOptions);
    onFitView?.();
  };

  const onToggleInteractivity = () => {
    useReactFlow.setState({
      nodesDraggable: !isInteractive,
      elementsSelectable: !isInteractive,
    });

    onInteractiveChange?.(!isInteractive);
  };

  return (
    <Panel
      className={cc(["react-flow__controls", className])}
      position={position}
      style={style}
      data-testid="rf__controls"
    >
      {showZoom && (
        <>
          <ControlButton
            onClick={onZoomInHandler}
            className="react-flow__controls-zoomin"
            title="zoom in"
            aria-label="zoom in"
            disabled={maxZoomReached}
          >
            <PlusIcon />
          </ControlButton>
          <ControlButton
            onClick={onZoomOutHandler}
            className="react-flow__controls-zoomout"
            title="zoom out"
            aria-label="zoom out"
            disabled={minZoomReached}
          >
            <MinusIcon />
          </ControlButton>
        </>
      )}
      {showFitView && (
        <ControlButton
          className="react-flow__controls-fitview"
          onClick={onFitViewHandler}
          title="fit view"
          aria-label="fit view"
        >
          <FitviewIcon />
        </ControlButton>
      )}
      {showInteractive && (
        <ControlButton
          className="react-flow__controls-interactive"
          onClick={onToggleInteractivity}
          title="toggle interactivity"
          aria-label="toggle interactivity"
        >
          {isInteractive ? <UnlockIcon /> : <LockIcon />}
        </ControlButton>
      )}
      {children}
    </Panel>
  );
};

Controls.displayName = "Controls";

export default memo(Controls);
