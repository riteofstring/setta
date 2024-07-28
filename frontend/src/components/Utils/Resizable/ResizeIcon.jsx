export function ResizeIcon() {
  return (
    <div className="absolute bottom-3 right-3 h-5 w-5">
      <svg
        className="fill-setta-500/50 dark:fill-setta-300/50"
        viewBox="0 0 36 36"
        version="1.1"
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="12" cy="24" r="1.5"></circle>
        <circle cx="18" cy="24" r="1.5"></circle>
        <circle cx="18" cy="18" r="1.5"></circle>
        <circle cx="24" cy="12" r="1.5"></circle>
        <circle cx="24" cy="24" r="1.5"></circle>
        <circle cx="24" cy="18" r="1.5"></circle>
        <rect x="0" y="0" width="36" height="36" fillOpacity="0" />
      </svg>
    </div>
  );
}
