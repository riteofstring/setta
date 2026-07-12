import type { CloudRuntimeProvisionResolveRequest } from "@shared/types";

import { Input } from "./ui/input";

export interface RuntimeCloudAWSPlacementInputValues {
  awsSecurityGroupId: string;
  awsSubnetId: string;
  awsVpcId: string;
}

export interface RuntimeCloudReleaseInputValues {
  installerSha256: string;
  minisignPublicKey: string;
  releaseBaseUrl: string;
  settaVersion: string;
}

export function RuntimeCloudAWSPlacementInputs({
  controlsDisabled,
  onUpdate,
  providerId,
  values,
}: {
  controlsDisabled: boolean;
  onUpdate: (field: keyof RuntimeCloudAWSPlacementInputValues, value: string) => void;
  providerId: string | null;
  values: RuntimeCloudAWSPlacementInputValues;
}) {
  if (providerId !== "aws") {
    return null;
  }
  return (
    <div className="grid gap-1">
      <div className="grid grid-cols-2 gap-1">
        <Input
          aria-label="AWS VPC ID"
          autoComplete="off"
          disabled={controlsDisabled}
          onChange={(event) => onUpdate("awsVpcId", event.target.value)}
          placeholder="vpc-..."
          value={values.awsVpcId}
        />
        <Input
          aria-label="AWS subnet ID"
          autoComplete="off"
          disabled={controlsDisabled}
          onChange={(event) => onUpdate("awsSubnetId", event.target.value)}
          placeholder="subnet-..."
          value={values.awsSubnetId}
        />
      </div>
      <Input
        aria-label="AWS security group ID"
        autoComplete="off"
        disabled={controlsDisabled}
        onChange={(event) => onUpdate("awsSecurityGroupId", event.target.value)}
        placeholder="sg-..."
        value={values.awsSecurityGroupId}
      />
    </div>
  );
}

export function RuntimeCloudReleaseInputs({
  controlsDisabled,
  onUpdate,
  values,
}: {
  controlsDisabled: boolean;
  onUpdate: (field: keyof RuntimeCloudReleaseInputValues, value: string) => void;
  values: RuntimeCloudReleaseInputValues;
}) {
  return (
    <div className="grid gap-1">
      <div className="grid grid-cols-2 gap-1">
        <Input
          aria-label="Cloud Setta version"
          autoComplete="off"
          disabled={controlsDisabled}
          onChange={(event) => onUpdate("settaVersion", event.target.value)}
          placeholder="v1.2.3"
          value={values.settaVersion}
        />
        <Input
          aria-label="Cloud release base URL"
          autoComplete="off"
          disabled={controlsDisabled}
          onChange={(event) => onUpdate("releaseBaseUrl", event.target.value)}
          placeholder="https://downloads.example.test/setta/v1.2.3"
          value={values.releaseBaseUrl}
        />
      </div>
      <div className="grid grid-cols-2 gap-1">
        <Input
          aria-label="Cloud installer SHA-256"
          autoComplete="off"
          disabled={controlsDisabled}
          onChange={(event) => onUpdate("installerSha256", event.target.value)}
          placeholder="installer sha256"
          value={values.installerSha256}
        />
        <Input
          aria-label="Cloud minisign public key"
          autoComplete="off"
          disabled={controlsDisabled}
          onChange={(event) => onUpdate("minisignPublicKey", event.target.value)}
          placeholder="RWQ..."
          value={values.minisignPublicKey}
        />
      </div>
    </div>
  );
}

export function runtimeCloudAWSPlacementInput(
  provider: string,
  values: RuntimeCloudAWSPlacementInputValues,
): CloudRuntimeProvisionResolveRequest["awsPlacement"] {
  if (provider !== "aws") {
    return undefined;
  }
  const placement = {
    securityGroupId: optionalTrimmed(values.awsSecurityGroupId),
    subnetId: optionalTrimmed(values.awsSubnetId),
    vpcId: optionalTrimmed(values.awsVpcId),
  };
  return placement.securityGroupId || placement.subnetId || placement.vpcId ? placement : undefined;
}

function optionalTrimmed(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
