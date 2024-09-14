import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import { openDrawAreaContextMenu } from "state/actions/contextMenus";
import { setSectionSize } from "state/actions/sections/setters";
import { useSectionInfos } from "state/definitions";
import { useArtifactData } from "state/hooks/artifacts";
import useDeepCompareEffect from "use-deep-compare-effect";

// some code from https://stackoverflow.com/a/29073539

export function DrawOnImage({ sectionId }) {
  const { artifacts, isLoaded } = useArtifactData(sectionId);
  const { width, height } = useSectionInfos(
    (x) => x.x[sectionId].size,
    _.isEqual,
  );
  const imageUrl = "https://kevinmusgrave.com/img/kevin-musgrave2.png";
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const prevPointRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEraser, setIsEraser] = useState(false);

  const updateCanvasSize = () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;

    if (image && image.complete) {
      canvas.width = width === "auto" ? image.width : width;
      canvas.height = height === "auto" ? image.height : height;

      if (width === "auto" || height === "auto") {
        setSectionSize(sectionId, { width: image.width, height: image.height });
      }
    }
    setupCanvasContext();
  };

  const setupCanvasContext = () => {
    const ctx = canvasRef.current.getContext("2d");
    if (isEraser) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgb(255,0,0)";
      ctx.lineWidth = 16;
      ctx.lineCap = "round";
    //   ctx.globalAlpha = 0.5;
    }
  };

  useDeepCompareEffect(() => {
    if (isLoaded) {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${Object.values(artifacts)[0].value}`;
      image.onload = () => {
        imageRef.current = image;
        updateCanvasSize();
      };
    }
  }, [artifacts, isLoaded]);

  useEffect(() => {
    setupCanvasContext();
  }, [isEraser]);

  useEffect(() => {
    updateCanvasSize();
  }, [height, width]);

  function onMouseDown(e) {
    setIsDrawing(true);
    prevPointRef.current = getXY(e);
  }

  function onMouseMove(e) {
    if (!isDrawing) return;
    const point = getXY(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath(); // new path
    ctx.moveTo(prevPointRef.current.x, prevPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    prevPointRef.current = point;
  }

  function onMouseUp() {
    setIsDrawing(false); // when up:
  }

  function toggleEraser() {
    setIsEraser(!isEraser);
  }

  return (
    <div
      className="nodrag"
      style={{
        position: "relative",
        width: `${width}px`,
        height: `${height}px`,
      }}
      onContextMenu={(e) =>
        openDrawAreaContextMenu(e, imageRef.current, canvasRef.current)
      }
    >
      {isLoaded && (
        <img
          src={`data:image/png;base64,${Object.values(artifacts)[0].value}`}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        />
      )}
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        className="border border-gray-300"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      />

      <button
        onClick={toggleEraser}
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          zIndex: 2,
          padding: "5px 10px",
          backgroundColor: isEraser ? "#f0f0f0" : "#fff",
          border: "1px solid #ccc",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        {isEraser ? "Draw" : "Erase"}
      </button>
    </div>
  );
}

function getXY(e) {
  const { offsetX, offsetY } = e.nativeEvent;
  return { x: offsetX, y: offsetY };
}
