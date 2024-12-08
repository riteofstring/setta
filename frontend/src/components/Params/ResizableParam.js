import React, { useState } from "react";

const KeyValuePair = ({
  keyValue,
  value,
  onKeyChange,
  onValueChange,
  showResizeHandle,
  onMouseDown,
  style,
}) => {
  return (
    <article
      className="group col-span-3 grid grid-cols-subgrid rounded pl-6 transition-colors duration-150 hover:bg-gray-50"
      style={style}
    >
      <input
        type="text"
        value={keyValue}
        onChange={onKeyChange}
        className="w-full rounded border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 group-hover:border-blue-200"
      />

      <div className="relative">
        {showResizeHandle && (
          <div
            className="group/resize absolute inset-y-0 left-1/2 -ml-2 flex w-4 cursor-col-resize items-center justify-center hover:bg-blue-100"
            onMouseDown={onMouseDown}
          >
            <div className="h-full w-1 bg-gray-300 group-hover/resize:bg-blue-500" />
          </div>
        )}
      </div>

      <input
        type="text"
        value={value}
        onChange={onValueChange}
        className="w-full rounded border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 group-hover:border-blue-200"
      />
    </article>
  );
};

const NestedKeyValuePair = ({
  data,
  onUpdate,
  onResizeStart,
  baseColumnWidth,
}) => {
  const handleKeyChange = (e) => {
    onUpdate({ ...data, key: e.target.value });
  };

  const handleValueChange = (e) => {
    if (!data.nested) {
      onUpdate({ ...data, value: e.target.value });
    }
  };

  const gridStyle = {
    gridTemplateColumns: `${baseColumnWidth}px 16px 1fr`,
    width: "100%",
  };

  if (data.nested) {
    return (
      <article className="col-span-3 grid grid-cols-subgrid pl-6">
        <p className="col-span-3 p-1 font-medium text-gray-700 group-hover:text-gray-900">
          {data.key}
        </p>

        {data.items.map((item, index) => (
          <NestedKeyValuePair
            key={index}
            data={item}
            baseColumnWidth={baseColumnWidth}
            onResizeStart={onResizeStart}
            onUpdate={(updatedItem) => {
              const newItems = [...data.items];
              newItems[index] = updatedItem;
              onUpdate({ ...data, items: newItems });
            }}
          />
        ))}
      </article>
    );
  }

  return (
    <KeyValuePair
      keyValue={data.key}
      value={data.value}
      onKeyChange={handleKeyChange}
      onValueChange={handleValueChange}
      showResizeHandle={true}
      onMouseDown={onResizeStart}
      style={gridStyle}
    />
  );
};

const ResizableGrid = () => {
  const [data, setData] = useState({
    key: "Personal Information",
    nested: true,
    items: [
      { key: "name", value: "John Doe", nested: false },
      { key: "email", value: "john@example.com", nested: false },
      {
        key: "Address Details",
        nested: true,
        items: [
          { key: "street", value: "123 Main St", nested: false },
          { key: "city", value: "Springfield", nested: false },
          {
            key: "Contact Information",
            nested: true,
            items: [
              { key: "phone", value: "555-0123", nested: false },
              { key: "alternate", value: "555-4567", nested: false },
            ],
          },
        ],
      },
      { key: "age", value: "30", nested: false },
    ],
  });

  const [isResizing, setIsResizing] = useState(false);
  const [columnWidth, setColumnWidth] = useState(200);
  const [startX, setStartX] = useState(0);
  const containerRef = React.useRef(null);

  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
    setStartX(e.clientX);
  };

  const handleMouseMove = (e) => {
    if (!isResizing || !containerRef.current) return;

    const diff = e.clientX - startX;
    const containerWidth = containerRef.current.clientWidth;
    const minWidth = 100;
    const maxWidth = containerWidth - 200;

    const newWidth = Math.max(minWidth, Math.min(maxWidth, columnWidth + diff));
    setColumnWidth(newWidth);
    setStartX(e.clientX);
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  React.useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isResizing, startX, columnWidth]);

  return (
    <div
      className="relative mx-auto w-full max-w-4xl rounded-lg bg-white p-4 shadow"
      ref={containerRef}
    >
      <article
        className="grid"
        style={{
          gridTemplateColumns: `${columnWidth}px 16px 1fr`,
        }}
      >
        <div className="section-key font-semibold">Key</div>

        <div className="section-value font-semibold">Value</div>

        <NestedKeyValuePair
          data={data}
          onUpdate={setData}
          onResizeStart={handleResizeStart}
          baseColumnWidth={columnWidth}
        />
      </article>
    </div>
  );
};

export default ResizableGrid;
