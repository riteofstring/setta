export function LinePattern({
  color,
  dimensions,
  lineWidth,
}: {
  dimensions: [number, number];
  lineWidth?: number;
  color: string;
}) {
  return (
    <path
      stroke={color}
      strokeWidth={lineWidth}
      d={`M${dimensions[0] / 2} 0 V${dimensions[1]} M0 ${dimensions[1] / 2} H${dimensions[0]}`}
    />
  );
}

export function DotPattern({
  color,
  radius,
}: {
  radius: number;
  color: string;
}) {
  return <circle cx={radius} cy={radius} r={radius} fill={color} />;
}
