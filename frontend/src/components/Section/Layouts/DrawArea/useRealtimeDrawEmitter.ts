import _ from "lodash";
import { useCallback, useEffect, useMemo } from "react";
import { sendRealtimeSectionBinary } from "state/actions/websocketRealtimeBinary";
import { serializeLayerStackToBlob } from "./binaryConversion";
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
  const captureSnapshot = useCallback(async () => {
    return await serializeLayerStackToBlob(
      layerCanvasRefs.current ?? [],
      draftCanvasRef.current,
    );
  }, [layerCanvasRefs, draftCanvasRef]);

  const emitSnapshot = useCallback(async () => {
    const blob = await captureSnapshot();
    if (!blob) {
      return;
    }
    const buffer = await blob.arrayBuffer();
    sendRealtimeSectionBinary(sectionId, buffer, blob.type || "image/png");
  }, [captureSnapshot, sectionId]);

  const throttleMs =
    drawThrottleDelay > 0 ? drawThrottleDelay : DEFAULT_THROTTLE_MS;

  const throttledEmit = useMemo(() => {
    return _.throttle(
      () => {
        void emitSnapshot();
      },
      throttleMs,
      {
        leading: true,
        trailing: true,
      },
    );
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
    void emitSnapshot();
  }, [throttledEmit, emitSnapshot]);

  return { notifyRealtimeDirty, flushRealtimeSnapshot };
}
