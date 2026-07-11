import type { CloudRuntimeProvisionResolution } from "@shared/types";
import { AlertTriangle, Check, Cloud } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";

interface CloudRuntimeResolutionApprovalView {
  message: string;
}

export function CloudRuntimeResolutionCard({
  approval,
  authSource,
  busy,
  onApprove,
  resolution,
  warnings,
}: {
  approval: CloudRuntimeResolutionApprovalView | null;
  authSource: "manual" | "oauth";
  busy: boolean;
  onApprove: () => void;
  resolution: CloudRuntimeProvisionResolution;
  warnings: string[];
}) {
  const allWarnings = [...warnings, ...resolution.warnings].filter(
    (warning, index, all) => warning.trim() !== "" && all.indexOf(warning) === index,
  );
  return (
    <article
      aria-label="Cloud runtime resolution"
      className="grid gap-2 rounded-sm border border-border bg-card p-2 text-xs"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Cloud className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {resolution.displayName} · {resolution.instanceType}
        </span>
        <span className={cn("shrink-0 rounded-sm px-1.5 py-0.5", sourceClass(resolution.source))}>
          {sourceLabel(resolution.source)}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-muted-foreground">
        <RuntimeCloudFact label="Region" value={resolution.region} />
        <RuntimeCloudFact label="Disk" value={`${resolution.diskGB} GB`} />
        <RuntimeCloudFact label="Shape" value={resolution.shape} />
        <RuntimeCloudFact label="Cost" value={costLabel(resolution)} />
        <RuntimeCloudFact label="Image" value={resolution.imageSelector.value} />
        <RuntimeCloudFact label="Auth key" value={authSource === "oauth" ? "OAuth" : "Manual"} />
        {awsPlacementFacts(resolution).map((fact) => (
          <RuntimeCloudFact key={fact.label} label={fact.label} value={fact.value} />
        ))}
      </dl>
      <p className="break-words text-[11px] leading-4 text-muted-foreground">
        {resolution.imageSelector.description}
      </p>
      <RuntimeCloudTier2Instructions resolution={resolution} />
      {allWarnings.length > 0 ? (
        <ul className="grid gap-1 text-[11px] leading-4 text-amber-300">
          {allWarnings.map((warning) => (
            <li className="flex min-w-0 gap-1" key={warning}>
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="min-w-0 break-words">{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {approval ? (
        <p className="flex min-w-0 items-center gap-1.5 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300">
          <Check className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words">{approval.message}</span>
        </p>
      ) : (
        <Button className="w-fit" disabled={busy} onClick={onApprove} variant="primary">
          Approve resolution
        </Button>
      )}
    </article>
  );
}

function awsPlacementFacts(
  resolution: CloudRuntimeProvisionResolution,
): Array<{ label: string; value: string }> {
  const placement = resolution.awsPlacement;
  if (!placement) {
    return [];
  }
  return [
    {
      label: "VPC",
      value: placement.vpcId ?? (placement.defaultVpcRequired ? "Default required" : "AWS"),
    },
    {
      label: "Subnet",
      value: placement.subnetId ?? "AWS",
    },
    {
      label: "Security group",
      value: placement.securityGroupId ?? "Create",
    },
  ];
}

function RuntimeCloudFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}

function RuntimeCloudTier2Instructions({
  resolution,
}: {
  resolution: CloudRuntimeProvisionResolution;
}) {
  const instructions = cloudRuntimeTier2Instructions(resolution);
  return (
    <details className="rounded-sm border border-border/70 bg-background/50 px-2 py-1.5 text-muted-foreground">
      <summary className="cursor-pointer text-foreground">Console paste path</summary>
      <ol className="mt-1 grid list-decimal gap-1 pl-4 text-[11px] leading-4">
        {instructions.map((instruction) => (
          <li className="break-words" key={instruction}>
            {instruction}
          </li>
        ))}
      </ol>
    </details>
  );
}

export function cloudRuntimeTier2Instructions(
  resolution: CloudRuntimeProvisionResolution,
): string[] {
  const common = [
    `Use ${resolution.region} and ${resolution.instanceType}.`,
    `Use image selector ${resolution.imageSelector.value}.`,
    `Set the boot disk to ${resolution.diskGB} GB or larger.`,
  ];
  switch (resolution.provider) {
    case "aws":
      return [
        "Open EC2 launch instance in the selected AWS region.",
        ...common,
        "Paste Setta cloud-init into Advanced details > User data.",
      ];
    case "digitalocean":
      return [
        "Open Droplets > Create Droplet in the selected region.",
        ...common,
        "Paste Setta cloud-init into Advanced Options > Add Initialization scripts.",
      ];
    case "gcp":
      return [
        "Open Compute Engine > VM instances > Create instance.",
        ...common,
        "Paste Setta cloud-init into metadata key user-data.",
      ];
    case "hetzner":
      return [
        "Open Hetzner Cloud > Servers > Create server in the selected location.",
        ...common,
        "Paste Setta cloud-init into the Cloud config field.",
      ];
    case "paperspace":
      return [
        "Use the existing-machine SSH flow for Paperspace machines that do not accept cloud-init.",
        ...common,
      ];
    default:
      return [
        "Open the provider VM creation console.",
        ...common,
        "Paste Setta cloud-init into the provider user-data or cloud-init field.",
      ];
  }
}

function costLabel(resolution: CloudRuntimeProvisionResolution): string {
  if (
    resolution.cost.kind === "live_hourly" &&
    resolution.cost.amount &&
    resolution.cost.currency
  ) {
    return `${resolution.cost.amount} ${resolution.cost.currency}/hr`;
  }
  if (resolution.cost.class) {
    return resolution.cost.class;
  }
  return resolution.cost.kind;
}

function sourceLabel(source: string): string {
  return source === "live_cli" ? "Live CLI" : "Catalog";
}

function sourceClass(source: string): string {
  return source === "live_cli"
    ? "bg-emerald-500/15 text-emerald-300"
    : "bg-amber-500/15 text-amber-300";
}
