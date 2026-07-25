import type {
  AppearanceColorMode,
  AppearanceColorScheme,
  AppearanceTailwindPalette,
} from "@generated/backend";
import { ChevronDown, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { type ReactNode, useMemo } from "react";

import { Input } from "./ui/input";
import { cn } from "../lib/utils";
import type { AppearanceColorGroup } from "../stores/appearance-store";

type AppearanceColorValues = AppearanceColorScheme[AppearanceColorGroup];

export function ModeSwitch({
  mode,
  onChange,
}: {
  mode: AppearanceColorMode;
  onChange: (mode: AppearanceColorMode) => void;
}) {
  return (
    <div
      aria-label="Color scheme"
      className="grid grid-cols-2 gap-1 rounded-sm border border-border bg-muted p-1"
      role="group"
    >
      {colorModes.map(({ Icon, label, value }) => (
        <button
          aria-pressed={mode === value}
          className={cn(
            "flex h-7 min-w-16 items-center justify-center gap-1.5 rounded-sm px-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:bg-accent",
            mode === value && "bg-card text-card-foreground shadow-sm",
          )}
          key={value}
          onClick={() => onChange(value)}
          title={`${label} mode`}
          type="button"
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function OKLCHSeedPicker({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const parsed = parseOKLCH(value);
  if (!parsed) {
    return null;
  }
  return <OKLCHSliderFields color={parsed} onChange={onChange} />;
}

export function StatusColorSection({
  mode,
  onChange,
  status,
  tailwind,
}: {
  mode: AppearanceColorMode;
  onChange: (
    mode: AppearanceColorMode,
    group: AppearanceColorGroup,
    name: string,
    value: string,
  ) => void;
  status: AppearanceColorScheme["status"];
  tailwind: AppearanceTailwindPalette;
}) {
  return (
    <section className="grid gap-2 rounded-sm border border-border bg-card/30 p-3">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-foreground">Status Colors</h3>
        <span className="text-[11px] font-medium text-muted-foreground">
          {Object.keys(status).length} values
        </span>
      </div>
      <StatusColorFields mode={mode} onChange={onChange} status={status} tailwind={tailwind} />
    </section>
  );
}

export function ColorSchemeFields({
  mode,
  onChange,
  scheme,
}: {
  mode: AppearanceColorMode;
  onChange: (
    mode: AppearanceColorMode,
    group: AppearanceColorGroup,
    name: string,
    value: string,
  ) => void;
  scheme: AppearanceColorScheme;
}) {
  const advancedColorCount =
    Object.keys(scheme.tailwind).length +
    Object.keys(scheme.shadcn).length +
    Object.keys(scheme.accent).length;

  return (
    <AccordionSection count={advancedColorCount} title="Advanced Color Tokens">
      <section className="grid gap-2">
        {(["tailwind", "shadcn", "accent"] as const).map((group) => {
          const values = scheme[group];
          return (
            <AccordionSection
              count={Object.keys(values).length}
              key={group}
              title={colorGroupLabels[group]}
            >
              <ColorFieldGrid
                group={group}
                mode={mode}
                onChange={onChange}
                tailwind={scheme.tailwind}
                values={values}
              />
            </AccordionSection>
          );
        })}
      </section>
    </AccordionSection>
  );
}

export function AccordionSection({
  children,
  count,
  icon,
  title,
}: {
  children: ReactNode;
  count: number;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <details className="group rounded-sm border border-border bg-card/30">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[11px] font-medium text-muted-foreground">
          {count} values
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-border p-3">{children}</div>
    </details>
  );
}

function StatusColorFields({
  mode,
  onChange,
  status,
  tailwind,
}: {
  mode: AppearanceColorMode;
  onChange: (
    mode: AppearanceColorMode,
    group: AppearanceColorGroup,
    name: string,
    value: string,
  ) => void;
  status: AppearanceColorScheme["status"];
  tailwind: AppearanceTailwindPalette;
}) {
  return (
    <ColorFieldGrid
      group="status"
      mode={mode}
      onChange={onChange}
      tailwind={tailwind}
      values={status}
    />
  );
}

function ColorFieldGrid({
  group,
  mode,
  onChange,
  tailwind,
  values,
}: {
  group: AppearanceColorGroup;
  mode: AppearanceColorMode;
  onChange: (
    mode: AppearanceColorMode,
    group: AppearanceColorGroup,
    name: string,
    value: string,
  ) => void;
  tailwind: AppearanceTailwindPalette;
  values: AppearanceColorValues;
}) {
  const settaOptions = useMemo(() => settaColorOptions(tailwind), [tailwind]);
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {Object.entries(values).map(([name, value]) => (
        <div className="grid min-w-0 gap-1" key={name}>
          <span className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              {fieldLabel(name)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {matchingSettaLabel(settaOptions, value) ?? "Custom OKLCH"}
            </span>
          </span>
          <ColorValueControls
            label={fieldLabel(name)}
            onChange={(nextValue) => onChange(mode, group, name, nextValue)}
            settaOptions={settaOptions}
            value={value}
          />
        </div>
      ))}
    </div>
  );
}

function ColorValueControls({
  label,
  onChange,
  settaOptions,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  settaOptions: SettaColorOption[];
  value: string;
}) {
  const selectedSettaValue = matchingSettaValue(settaOptions, value);
  const parsed = parseOKLCH(value);
  return (
    <span className="grid min-w-0 gap-1.5">
      <span className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-2">
        <span
          aria-hidden="true"
          className="h-5 w-5 rounded-sm border border-border"
          style={{ backgroundColor: value }}
        />
        <Input
          aria-label={`${label} OKLCH value`}
          className="font-mono"
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          value={value}
        />
      </span>
      <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <select
          aria-label="Setta color"
          className="h-8 min-w-0 rounded-sm border border-input bg-card px-2 text-xs text-foreground outline-none transition-colors focus:border-ring"
          onChange={(event) => {
            if (event.currentTarget.value !== customColorOptionValue) {
              onChange(event.currentTarget.value);
            }
          }}
          value={selectedSettaValue ?? customColorOptionValue}
        >
          <option value={customColorOptionValue}>Custom OKLCH</option>
          {settaOptions.map((option) => (
            <option key={option.name} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <details className="group relative">
          <summary
            aria-label="OKLCH picker"
            className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-sm border border-border bg-card text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground [&::-webkit-details-marker]:hidden"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </summary>
          <div className="absolute right-0 z-20 mt-1 grid w-72 gap-2 rounded-sm border border-border bg-popover p-3 shadow-xl">
            {parsed ? (
              <OKLCHSliderFields color={parsed} onChange={(nextColor) => onChange(nextColor)} />
            ) : (
              <div className="text-xs text-status-warning">
                Enter an OKLCH value like oklch(0.5000 0.1000 213.38).
              </div>
            )}
          </div>
        </details>
      </span>
    </span>
  );
}

function OKLCHSliderFields({
  color,
  onChange,
}: {
  color: OKLCHColor;
  onChange: (value: string) => void;
}) {
  const update = (patch: Partial<OKLCHColor>) => onChange(formatOKLCH({ ...color, ...patch }));
  return (
    <div className="grid gap-2">
      <OKLCHSlider
        label="Lightness"
        max={1}
        min={0}
        onChange={(lightness) => update({ lightness })}
        step={0.0001}
        value={color.lightness}
      />
      <OKLCHSlider
        label="Chroma"
        max={0.4}
        min={0}
        onChange={(chroma) => update({ chroma })}
        step={0.0001}
        value={color.chroma}
      />
      <OKLCHSlider
        label="Hue"
        max={360}
        min={0}
        onChange={(hue) => update({ hue })}
        step={0.01}
        value={color.hue}
      />
    </div>
  );
}

function OKLCHSlider({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="grid gap-1">
      <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-foreground">{value.toFixed(step < 0.01 ? 4 : 2)}</span>
      </span>
      <input
        className="w-full accent-primary"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

const colorModes = [
  { Icon: Moon, label: "Dark", value: "dark" },
  { Icon: Sun, label: "Light", value: "light" },
] as const satisfies Array<{
  Icon: typeof Moon;
  label: string;
  value: AppearanceColorMode;
}>;

const colorGroupLabels = {
  accent: "Accent Colors",
  shadcn: "shadcn/ui Tokens",
  status: "Status Colors",
  tailwind: "Palette Scale",
} as const satisfies Record<AppearanceColorGroup, string>;

const customColorOptionValue = "__custom_oklch__";

interface SettaColorOption {
  label: string;
  name: string;
  value: string;
}

interface OKLCHColor {
  chroma: number;
  hue: number;
  lightness: number;
}

function settaColorOptions(tailwind: AppearanceTailwindPalette): SettaColorOption[] {
  return Object.entries(tailwind).map(([name, value]) => ({
    label: fieldLabel(name),
    name,
    value,
  }));
}

function matchingSettaValue(options: SettaColorOption[], value: string) {
  return options.find((option) => option.value === value)?.value ?? null;
}

function matchingSettaLabel(options: SettaColorOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? null;
}

function parseOKLCH(value: string): OKLCHColor | null {
  const match = value.trim().match(/^oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\)$/i);
  if (!match) {
    return null;
  }
  const lightness = Number(match[1]);
  const chroma = Number(match[2]);
  const hue = Number(match[3]);
  if (!Number.isFinite(lightness) || !Number.isFinite(chroma) || !Number.isFinite(hue)) {
    return null;
  }
  return {
    chroma: clamp(chroma, 0, 0.4),
    hue: normalizeHue(hue),
    lightness: clamp(lightness, 0, 1),
  };
}

function formatOKLCH(color: OKLCHColor) {
  return `oklch(${color.lightness.toFixed(4)} ${color.chroma.toFixed(4)} ${color.hue.toFixed(2)})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeHue(hue: number) {
  return ((hue % 360) + 360) % 360;
}

export function fieldLabel(name: string) {
  return name
    .replace(/^setta(\d+)$/, "setta $1")
    .replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`)
    .replace(/^\w/, (match) => match.toUpperCase());
}
