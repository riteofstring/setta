import _ from "lodash";
import { useCallback, useEffect, useMemo } from "react";
import { sendRealtimeSectionBase64 } from "state/actions/websocketReceive";
import { serializeLayerStackToBase64 } from "./base64Conversion";
import { LayerCanvasesType } from "./types";

const DEFAULT_THROTTLE_MS = 250;

type UseRealtimeDrawEmitterArgs = {
  sectionId: string;
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  drawThrottleDelay: number;
};

type UseRealtimeDrawEmitterResult = {
  notifyRealtimeDirty: () => void;
  flushRealtimeSnapshot: () => void;
};

export function useRealtimeDrawEmitter({
  sectionId,
  layerCanvasRefs,
  draftCanvasRef,
  drawThrottleDelay,
}: UseRealtimeDrawEmitterArgs): UseRealtimeDrawEmitterResult {
  const captureSnapshot = useCallback(() => {
    return serializeLayerStackToBase64(
      layerCanvasRefs.current ?? [],
      draftCanvasRef.current,
    );
  }, [layerCanvasRefs, draftCanvasRef]);

  const emitSnapshot = useCallback(() => {
    const base64 = captureSnapshot();
    if (!base64) {
      return;
    }
    sendRealtimeSectionBase64(sectionId, base64);
  }, [captureSnapshot, sectionId]);

  const throttleMs =
    drawThrottleDelay > 0 ? drawThrottleDelay : DEFAULT_THROTTLE_MS;

  const throttledEmit = useMemo(() => {
    return _.throttle(emitSnapshot, throttleMs, {
      leading: true,
      trailing: true,
    });
  }, [emitSnapshot, throttleMs]);

  useEffect(() => {
    return () => {
      throttledEmit.cancel();
    };
  }, [throttledEmit]);

  const notifyRealtimeDirty = useCallback(() => {
    throttledEmit();
  }, [throttledEmit]);

  const flushRealtimeSnapshot = useCallback(() => {
    throttledEmit.cancel();
    emitSnapshot();
  }, [throttledEmit, emitSnapshot]);

  return { notifyRealtimeDirty, flushRealtimeSnapshot };
}
