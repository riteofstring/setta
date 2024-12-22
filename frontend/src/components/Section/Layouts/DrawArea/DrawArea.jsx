import * as fabric from "fabric"; // v6
import { useEffect, useRef, useState } from "react";

export function DrawArea({ sectionId }) {
  const canvasEl = useRef(null);
  const [canvas, setCanvas] = useState(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [opacity, setOpacity] = useState(1);

  // Convert opacity to RGBA color
  const getColor = (opacity) => {
    // RGB values for green (0, 255, 0)
    return `rgba(0, 255, 0, ${opacity})`;
  };

  useEffect(() => {
    // Initialize canvas
    const fabricCanvas = new fabric.Canvas(canvasEl.current);

    // Initialize the brush
    fabricCanvas.isDrawingMode = false;
    const brush = new fabric.PencilBrush(fabricCanvas);
    brush.width = 5;
    brush.color = getColor(opacity);
    fabricCanvas.freeDrawingBrush = brush;

    setCanvas(fabricCanvas);

    return () => {
      fabricCanvas.dispose();
    };
  }, []);

  // Toggle drawing mode
  const toggleDrawing = () => {
    if (canvas) {
      const newMode = !isDrawingMode;
      canvas.isDrawingMode = newMode;
      setIsDrawingMode(newMode);
    }
  };

  // Clear canvas
  const clearCanvas = () => {
    if (canvas) {
      canvas.clear();
    }
  };

  // Update opacity
  const handleOpacityChange = (e) => {
    const newOpacity = parseFloat(e.target.value);
    setOpacity(newOpacity);
    if (canvas && canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = getColor(newOpacity);
    }
  };

  return (
    <section className="nodrag single-cell-container section-row-main section-key-value relative max-h-full min-w-0">
      <div className="single-cell-child single-cell-container flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleDrawing}
            className={`rounded px-4 py-2 ${
              isDrawingMode
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {isDrawingMode ? "Stop Drawing" : "Start Drawing"}
          </button>
          <button
            onClick={clearCanvas}
            className="rounded bg-red-500 px-4 py-2 text-white"
          >
            Clear
          </button>
          <div className="flex items-center gap-2">
            <label htmlFor="opacity" className="text-sm">
              Opacity:
            </label>
            <input
              id="opacity"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={opacity}
              onChange={handleOpacityChange}
              className="w-32"
            />
            <span className="text-sm">{opacity.toFixed(1)}</span>
          </div>
        </div>
        <canvas
          width="300"
          height="300"
          ref={canvasEl}
          className="border border-gray-300"
        />
      </div>
    </section>
  );
}
