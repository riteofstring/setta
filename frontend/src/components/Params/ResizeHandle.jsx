export function ResizeHandle({ showResizeHandle, onMouseDown }) {
  return (
    <div className="RESIZE section-center relative h-full w-full">
      {showResizeHandle && (
        <div
          className="nodrag group/resize absolute inset-y-0 left-1/2 -ml-2 flex w-4 cursor-col-resize items-center justify-center "
          onMouseDown={onMouseDown}
        >
          <div className="h-[calc(100%-4px)] w-1 rounded-sm bg-transparent hover:!bg-blue-500 group-hover/resize:bg-setta-500/50" />
        </div>
      )}
    </div>
  );
}
