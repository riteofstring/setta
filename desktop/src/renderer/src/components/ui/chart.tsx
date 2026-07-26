import * as React from "react";
import * as RechartsPrimitive from "recharts";
import type { TooltipValueType } from "recharts";

import { cn } from "@renderer/lib/utils";

// Format: { THEME_NAME: CSS_SELECTOR }
// Setta's colour mode lives on the document element's `data-color-mode` and is
// dark unless that attribute says light, so the dark selector is the same
// condition the `dark:` variant in ../../styles.css uses.
const THEMES = { light: "", dark: ':root:not([data-color-mode="light"])' } as const;

type TooltipNameType = number | string;

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
>;

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "cn-chart flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(([, config]) => config.theme ?? config.color);

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color = itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ?? itemConfig.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .join("\n")}
}
`,
          )
          .join("\n"),
      }}
    />
  );
};

const ChartTooltip = RechartsPrimitive.Tooltip;

type ChartTooltipContentProps = React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: "line" | "dot" | "dashed";
    nameKey?: string;
    labelKey?: string;
  } & Omit<
    RechartsPrimitive.DefaultTooltipContentProps<TooltipValueType, TooltipNameType>,
    "accessibilityLayer"
  >;

type ChartTooltipPayloadItem = NonNullable<ChartTooltipContentProps["payload"]>[number];

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: ChartTooltipContentProps) {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(
    () =>
      renderTooltipLabel({
        config,
        hideLabel,
        label,
        labelClassName,
        labelFormatter,
        labelKey,
        payload,
      }),
    [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey],
  );

  if (!active || !payload?.length) {
    return null;
  }

  const nestLabel = payload.length === 1 && indicator !== "dot";

  return (
    <div className={cn("cn-chart-tooltip grid min-w-32 items-start", className)}>
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload
          .filter((item) => item.type !== "none")
          .map((item, index) => (
            <ChartTooltipPayloadRow
              color={color}
              config={config}
              formatter={formatter}
              hideIndicator={hideIndicator}
              index={index}
              indicator={indicator}
              item={item}
              key={index}
              nameKey={nameKey}
              nestLabel={nestLabel}
              tooltipLabel={tooltipLabel}
            />
          ))}
      </div>
    </div>
  );
}

function renderTooltipLabel({
  config,
  hideLabel,
  label,
  labelClassName,
  labelFormatter,
  labelKey,
  payload,
}: Pick<
  ChartTooltipContentProps,
  "hideLabel" | "label" | "labelClassName" | "labelFormatter" | "labelKey" | "payload"
> & {
  config: ChartConfig;
}): React.ReactNode {
  if (hideLabel || payload === undefined || payload.length === 0) {
    return null;
  }
  const item = payload[0];
  if (item === undefined) {
    return null;
  }
  const key = tooltipPayloadKey(labelKey, item);
  const value = tooltipLabelValue(config, item, key, labelKey, label);
  if (labelFormatter) {
    return (
      <div className={cn("font-medium", labelClassName)}>{labelFormatter(value, payload)}</div>
    );
  }
  if (!value) {
    return null;
  }
  return <div className={cn("font-medium", labelClassName)}>{value}</div>;
}

function tooltipLabelValue(
  config: ChartConfig,
  item: ChartTooltipPayloadItem,
  key: string,
  labelKey: string | undefined,
  label: React.ReactNode,
): React.ReactNode {
  if (labelKey === undefined && typeof label === "string") {
    return config[label]?.label ?? label;
  }
  return getPayloadConfigFromPayload(config, item, key)?.label;
}

function tooltipPayloadKey(
  configuredKey: string | undefined,
  item: ChartTooltipPayloadItem,
): string {
  if (configuredKey !== undefined) {
    return configuredKey;
  }
  if (item.dataKey !== undefined) {
    return String(item.dataKey);
  }
  if (item.name !== undefined) {
    return String(item.name);
  }
  return "value";
}

function ChartTooltipPayloadRow({
  color,
  config,
  formatter,
  hideIndicator,
  index,
  indicator,
  item,
  nameKey,
  nestLabel,
  tooltipLabel,
}: {
  color: string | undefined;
  config: ChartConfig;
  formatter: ChartTooltipContentProps["formatter"];
  hideIndicator: boolean;
  index: number;
  indicator: "line" | "dot" | "dashed";
  item: ChartTooltipPayloadItem;
  nameKey: string | undefined;
  nestLabel: boolean;
  tooltipLabel: React.ReactNode;
}) {
  const key = tooltipPayloadKey(nameKey, item);
  const itemConfig = getPayloadConfigFromPayload(config, item, key);
  const formatted = formatTooltipPayloadItem(formatter, item, index);
  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
        indicator === "dot" && "items-center",
      )}
    >
      {formatted.used ? (
        formatted.node
      ) : (
        <>
          <ChartTooltipMarker
            color={tooltipIndicatorColor(color, item)}
            hideIndicator={hideIndicator}
            icon={itemConfig?.icon}
            indicator={indicator}
            nestLabel={nestLabel}
          />
          <div
            className={cn(
              "flex flex-1 justify-between leading-none",
              nestLabel ? "items-end" : "items-center",
            )}
          >
            <div className="grid gap-1.5">
              {nestLabel ? tooltipLabel : null}
              <span className="text-muted-foreground">{itemConfig?.label ?? item.name}</span>
            </div>
            <ChartTooltipValue value={item.value} />
          </div>
        </>
      )}
    </div>
  );
}

function formatTooltipPayloadItem(
  formatter: ChartTooltipContentProps["formatter"],
  item: ChartTooltipPayloadItem,
  index: number,
): { readonly used: false } | { readonly node: React.ReactNode; readonly used: true } {
  if (typeof formatter !== "function" || item.value === undefined || !item.name) {
    return { used: false };
  }
  return {
    node: formatter(item.value, item.name, item, index, item.payload),
    used: true,
  };
}

function ChartTooltipMarker({
  color,
  hideIndicator,
  icon: Icon,
  indicator,
  nestLabel,
}: {
  color: string | undefined;
  hideIndicator: boolean;
  icon: React.ComponentType | undefined;
  indicator: "line" | "dot" | "dashed";
  nestLabel: boolean;
}) {
  if (Icon !== undefined) {
    return <Icon />;
  }
  if (hideIndicator) {
    return null;
  }
  return (
    <div
      className={cn("shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)", {
        "h-2.5 w-2.5": indicator === "dot",
        "w-1": indicator === "line",
        "w-0 border-[1.5px] border-dashed bg-transparent": indicator === "dashed",
        "my-0.5": nestLabel && indicator === "dashed",
      })}
      style={
        {
          "--color-bg": color,
          "--color-border": color,
        } as React.CSSProperties
      }
    />
  );
}

function ChartTooltipValue({ value }: { value: ChartTooltipPayloadItem["value"] }) {
  if (value == null) {
    return null;
  }
  const text = typeof value === "number" ? value.toLocaleString() : String(value);
  return <span className="font-mono font-medium text-foreground tabular-nums">{text}</span>;
}

function tooltipIndicatorColor(
  configuredColor: string | undefined,
  item: ChartTooltipPayloadItem,
): string | undefined {
  if (configuredColor !== undefined) {
    return configuredColor;
  }
  if (typeof item.payload?.fill === "string") {
    return item.payload.fill;
  }
  return item.color;
}

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: React.ComponentProps<"div"> & {
  hideIcon?: boolean;
  nameKey?: string;
} & RechartsPrimitive.DefaultLegendContentProps) {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className,
      )}
    >
      {payload
        .filter((item) => item.type !== "none")
        .map((item, index) => {
          const key = `${nameKey ?? item.dataKey ?? "value"}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);

          return (
            <div
              key={index}
              className={cn(
                "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground",
              )}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
              )}
              {itemConfig?.label}
            </div>
          );
        })}
    </div>
  );
}

function getPayloadConfigFromPayload(config: ChartConfig, payload: unknown, key: string) {
  const payloadRecord = payloadObject(payload);
  if (payloadRecord === undefined) {
    return undefined;
  }
  const nestedPayload = payloadObject(payloadRecord.payload);
  const directKey = payloadString(payloadRecord, key);
  const nestedKey = nestedPayload === undefined ? undefined : payloadString(nestedPayload, key);
  const configLabelKey = directKey ?? nestedKey ?? key;
  return configLabelKey in config ? config[configLabelKey] : config[key];
}

function payloadObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function payloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
};
