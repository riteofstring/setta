export function Item({ children, onClick }) {
  return (
    <div className="text-sm flex flex-row gap-1" onClick={onClick}>
      {children}
    </div>
  );
}
