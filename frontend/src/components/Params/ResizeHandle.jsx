export function ResizeHandle({ showResizeHandle, onMouseDown }) {
  return (
    <div className="RESIZE section-center relative h-full w-full">
      {showResizeHandle && (
        <div
          className="nodrag group/resize absolute inset-y-0 left-1/2 -ml-2 flex w-4 cursor-col-resize items-center justify-center hover:bg-blue-100"
          onMouseDown={onMouseDown}
        >
          <div className="h-full w-1 bg-setta-300 group-hover/resize:bg-blue-500" />
        </div>
      )}
    </div>
  );
}
