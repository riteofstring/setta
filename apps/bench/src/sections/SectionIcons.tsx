type IconProps = {
  className?: string;
  "aria-hidden"?: boolean;
  focusable?: "false";
};

function iconProps(props: IconProps) {
  return {
    ...props,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.35,
    viewBox: "0 0 16 16",
  };
}

export function CasesIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M2.5 3.5h11v9h-11zM2.5 6.5h11M6 3.5v9" />
    </svg>
  );
}

export function CandidateIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m6.5 3-4 5 4 5M9.5 3l4 5-4 5" />
    </svg>
  );
}

export function ChecksIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m5 3 7 5-7 5z" />
    </svg>
  );
}

export function RunsIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 2.5h10v11H3zM5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
    </svg>
  );
}

export function ReviewIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M2.5 3.5h11v8h-7l-3 2v-2h-1zM5 6h6M5 8.5h4" />
    </svg>
  );
}
