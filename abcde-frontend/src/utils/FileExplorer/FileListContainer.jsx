export default function FileListContainer({ radioGroup, children }) {
  return (
    <div
      className="h-[inherit] border border-gray-200 rounded-lg items-stretch px-6 py-4 overflow-y-auto"
      {...radioGroup}
    >
      {children}
    </div>
  );
}
