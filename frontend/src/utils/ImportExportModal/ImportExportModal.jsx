export function ImportExportModalContent({ projectJson }) {
  const value = JSON.stringify(projectJson, null, 2);

  return (
    <div
      className="grid-rows grid flex-grow overflow-hidden"
      style={{ minHeight: "1000px" }}
    >
      <textarea
        disabled={true}
        value={value}
        // onChange={(v) => setDescription(v.target.value)}
        placeholder="Write your description in Markdown..."
      />
    </div>
  );
}
