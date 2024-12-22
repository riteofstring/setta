import React, { useState, useRef, useEffect } from 'react';

const DraggableCanvas = () => {
  const canvasRef = useRef(null);
  const [elements, setElements] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [resizeHandle, setResizeHandle] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);
  const [mode, setMode] = useState('draw'); // 'draw' or 'edit'

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const drawResizeHandles = (element) => {
      const handleSize = 8;
      ctx.fillStyle = '#4299e1'; // blue-500
      
      if (element.type === 'image') {
        // Draw corner handles for images
        const corners = [
          { x: element.x, y: element.y },  // Top-left
          { x: element.x + element.width, y: element.y },  // Top-right
          { x: element.x, y: element.y + element.height },  // Bottom-left
          { x: element.x + element.width, y: element.y + element.height }  // Bottom-right
        ];
        
        corners.forEach(corner => {
          ctx.fillRect(
            corner.x - handleSize/2,
            corner.y - handleSize/2,
            handleSize,
            handleSize
          );
        });
      } else if (element.type === 'path') {
        // Get bounding box of path
        const bounds = getPathBounds(element.points);
        
        // Draw corner handles for paths
        const corners = [
          { x: bounds.minX, y: bounds.minY },  // Top-left
          { x: bounds.maxX, y: bounds.minY },  // Top-right
          { x: bounds.minX, y: bounds.maxY },  // Bottom-left
          { x: bounds.maxX, y: bounds.maxY }   // Bottom-right
        ];
        
        corners.forEach(corner => {
          ctx.fillRect(
            corner.x - handleSize/2,
            corner.y - handleSize/2,
            handleSize,
            handleSize
          );
        });
      }
    };

    const redraw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      elements.forEach((element, index) => {
        if (element.type === 'image') {
          ctx.drawImage(element.image, element.x, element.y, element.width, element.height);
        } else if (element.type === 'path') {
          ctx.beginPath();
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 2;
          element.points.forEach((point, i) => {
            if (i === 0) {
              ctx.moveTo(point.x, point.y);
            } else {
              ctx.lineTo(point.x, point.y);
            }
          });
          ctx.stroke();
        }
        
        if (index === selectedIndex) {
          drawResizeHandles(element);
        }
      });
    };

    redraw();
  }, [elements, selectedIndex]);

  const getPathBounds = (points) => {
    const xCoords = points.map(p => p.x);
    const yCoords = points.map(p => p.y);
    return {
      minX: Math.min(...xCoords),
      maxX: Math.max(...xCoords),
      minY: Math.min(...yCoords),
      maxY: Math.max(...yCoords)
    };
  };

  const resizePath = (path, bounds, dx, dy, handle) => {
    const oldWidth = bounds.maxX - bounds.minX;
    const oldHeight = bounds.maxY - bounds.minY;
    
    let scaleX = 1;
    let scaleY = 1;
    let translateX = 0;
    let translateY = 0;

    switch(handle) {
      case 0: // Top-left
        scaleX = (oldWidth - dx) / oldWidth;
        scaleY = (oldHeight - dy) / oldHeight;
        translateX = bounds.minX + dx;
        translateY = bounds.minY + dy;
        break;
      case 1: // Top-right
        scaleX = (oldWidth + dx) / oldWidth;
        scaleY = (oldHeight - dy) / oldHeight;
        translateX = bounds.minX;
        translateY = bounds.minY + dy;
        break;
      case 2: // Bottom-left
        scaleX = (oldWidth - dx) / oldWidth;
        scaleY = (oldHeight + dy) / oldHeight;
        translateX = bounds.minX + dx;
        translateY = bounds.minY;
        break;
      case 3: // Bottom-right
        scaleX = (oldWidth + dx) / oldWidth;
        scaleY = (oldHeight + dy) / oldHeight;
        translateX = bounds.minX;
        translateY = bounds.minY;
        break;
    }

    // Ensure minimum scale and prevent movement when minimum size is reached
    const originalScaleX = scaleX;
    const originalScaleY = scaleY;
    const originalTranslateX = translateX;
    const originalTranslateY = translateY;

    if (scaleX * oldWidth < 20) {
      scaleX = 20 / oldWidth;
      // Reset translation in x direction if we hit minimum width
      if (handle === 0 || handle === 2) {
        translateX = bounds.minX + (bounds.maxX - bounds.minX) * (1 - scaleX);
      }
    }
    
    if (scaleY * oldHeight < 20) {
      scaleY = 20 / oldHeight;
      // Reset translation in y direction if we hit minimum height
      if (handle === 0 || handle === 1) {
        translateY = bounds.minY + (bounds.maxY - bounds.minY) * (1 - scaleY);
      }
    }

    return path.points.map(point => ({
      x: translateX + (point.x - bounds.minX) * scaleX,
      y: translateY + (point.y - bounds.minY) * scaleY
    }));
  };

  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === 'edit' && selectedIndex !== null) {
      const element = elements[selectedIndex];
      const handleSize = 8;
      let corners;

      if (element.type === 'image') {
        corners = [
          { x: element.x, y: element.y },  // Top-left
          { x: element.x + element.width, y: element.y },  // Top-right
          { x: element.x, y: element.y + element.height },  // Bottom-left
          { x: element.x + element.width, y: element.y + element.height }  // Bottom-right
        ];
      } else if (element.type === 'path') {
        const bounds = getPathBounds(element.points);
        corners = [
          { x: bounds.minX, y: bounds.minY },  // Top-left
          { x: bounds.maxX, y: bounds.minY },  // Top-right
          { x: bounds.minX, y: bounds.maxY },  // Bottom-left
          { x: bounds.maxX, y: bounds.maxY }   // Bottom-right
        ];
      }

      for (let i = 0; i < corners.length; i++) {
        const corner = corners[i];
        if (Math.abs(x - corner.x) <= handleSize/2 && Math.abs(y - corner.y) <= handleSize/2) {
          setResizeHandle(i);
          setLastPos({ x, y });
          return;
        }
      }
    }

    if (mode === 'edit') {
      for (let i = elements.length - 1; i >= 0; i--) {
        const element = elements[i];
        if (element.type === 'image' &&
            x >= element.x && x <= element.x + element.width &&
            y >= element.y && y <= element.y + element.height) {
          setIsDragging(true);
          setDraggedIndex(i);
          setSelectedIndex(i);
          setLastPos({ x, y });
          return;
        } else if (element.type === 'path') {
          const hitRadius = 5;
          for (const point of element.points) {
            if (Math.abs(x - point.x) <= hitRadius && Math.abs(y - point.y) <= hitRadius) {
              setIsDragging(true);
              setDraggedIndex(i);
              setSelectedIndex(i);
              setLastPos({ x, y });
              return;
            }
          }
        }
      }
      setSelectedIndex(null);
    }

    if (mode === 'draw') {
      setIsDrawing(true);
      setCurrentPath([{ x, y }]);
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging && !isDrawing && resizeHandle === null) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDragging && draggedIndex !== null) {
      const dx = x - lastPos.x;
      const dy = y - lastPos.y;

      setElements(elements.map((element, index) => {
        if (index === draggedIndex) {
          if (element.type === 'image') {
            return {
              ...element,
              x: element.x + dx,
              y: element.y + dy
            };
          } else if (element.type === 'path') {
            return {
              ...element,
              points: element.points.map(point => ({
                x: point.x + dx,
                y: point.y + dy
              }))
            };
          }
        }
        return element;
      }));

      setLastPos({ x, y });
    } else if (resizeHandle !== null && selectedIndex !== null) {
      const dx = x - lastPos.x;
      const dy = y - lastPos.y;
      
      setElements(elements.map((element, index) => {
        if (index === selectedIndex) {
          if (element.type === 'image') {
            let newElement = { ...element };
            switch(resizeHandle) {
              case 0: // Top-left
                newElement.width -= dx;
                newElement.height -= dy;
                newElement.x += dx;
                newElement.y += dy;
                break;
              case 1: // Top-right
                newElement.width += dx;
                newElement.height -= dy;
                newElement.y += dy;
                break;
              case 2: // Bottom-left
                newElement.width -= dx;
                newElement.height += dy;
                newElement.x += dx;
                break;
              case 3: // Bottom-right
                newElement.width += dx;
                newElement.height += dy;
                break;
            }
            
            if (newElement.width < 20) {
              newElement.width = 20;
              newElement.x = element.x;
            }
            if (newElement.height < 20) {
              newElement.height = 20;
              newElement.y = element.y;
            }
            
            return newElement;
          } else if (element.type === 'path') {
            const bounds = getPathBounds(element.points);
            const newPoints = resizePath(element, bounds, dx, dy, resizeHandle);
            return {
              ...element,
              points: newPoints
            };
          }
        }
        return element;
      }));
      
      setLastPos({ x, y });
    } else if (isDrawing) {
      setCurrentPath([...currentPath, { x, y }]);
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && currentPath.length > 0) {
      setElements([...elements, {
        type: 'path',
        points: currentPath
      }]);
      setCurrentPath([]);
    }
    setIsDragging(false);
    setDraggedIndex(null);
    setIsDrawing(false);
    setResizeHandle(null);
  };

  const addImage = () => {
    const img = new Image();
    img.src = '/api/placeholder/100/100';
    img.onload = () => {
      setElements([...elements, {
        type: 'image',
        image: img,
        x: 50,
        y: 50,
        width: 100,
        height: 100
      }]);
    };
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-4">
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={addImage}
        >
          Add Image
        </button>
        <button
          className={`px-4 py-2 rounded ${
            mode === 'draw' 
              ? 'bg-green-500 hover:bg-green-600' 
              : 'bg-gray-500 hover:bg-gray-600'
          } text-white`}
          onClick={() => setMode('draw')}
        >
          Draw Mode
        </button>
        <button
          className={`px-4 py-2 rounded ${
            mode === 'edit' 
              ? 'bg-green-500 hover:bg-green-600' 
              : 'bg-gray-500 hover:bg-gray-600'
          } text-white`}
          onClick={() => setMode('edit')}
        >
          Edit Mode
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        className="border border-gray-300"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      <p className="text-sm text-gray-600">
        {mode === 'draw' 
          ? 'Click and drag to draw' 
          : 'Click and drag to move elements, or drag corners to resize'}
      </p>
    </div>
  );
};

export default DraggableCanvas;