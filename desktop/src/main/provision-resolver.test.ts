import { describe, expect, test } from "vitest";

import {
  listCloudRuntimeProvisionOptions,
  resolveCloudRuntimeProvision,
} from "./provision-resolver";

describe("cloud runtime provision resolver", () => {
  test("loads catalog options through the Setta CLI", async () => {
    const options = await listCloudRuntimeProvisionOptions({
      env: { SETTA_CLI_PATH: "/opt/setta" },
      repoRoot: "/repo",
      execFileRunner: async (command, args, runnerOptions) => {
        expect(command).toBe("/opt/setta");
        expect(args).toEqual(["provision", "shapes", "--json"]);
        expect(runnerOptions.cwd).toBe("/repo");
        return { stderr: "", stdout: JSON.stringify(shapesOutput()) };
      },
    });

    expect(options.defaultProvider).toBe("hetzner");
    expect(options.defaultShape).toBe("dev-standard");
    expect(options.providers[0]).toMatchObject({
      displayName: "Hetzner Cloud",
      id: "hetzner",
      shapeIds: ["dev-small", "dev-standard"],
    });
    expect(options.shapes[1]).toMatchObject({
      diskFloorGb: 64,
      id: "dev-standard",
      label: "Dev standard",
    });
  });

  test("resolves a concrete approval candidate through the read-only CLI path", async () => {
    const result = await resolveCloudRuntimeProvision(
      {
        diskGB: 96,
        intent: "cheap box for agents",
        provider: "hetzner",
        region: "fsn1",
        shape: "dev-standard",
      },
      {
        env: { SETTA_CLI_PATH: "/opt/setta" },
        repoRoot: "/repo",
        execFileRunner: async (command, args) => {
          expect(command).toBe("/opt/setta");
          expect(args).toEqual([
            "provision",
            "resolve",
            "--json",
            "--provider",
            "hetzner",
            "--shape",
            "dev-standard",
            "--region",
            "fsn1",
            "--disk-gb",
            "96",
            "--intent",
            "cheap box for agents",
          ]);
          return { stderr: "", stdout: JSON.stringify(resolveOutput()) };
        },
      },
    );

    expect(result.provider).toBe("hetzner");
    expect(result.shape).toBe("dev-standard");
    expect(result.constraints.intent).toBe("cheap box for agents");
    expect(result.resolution).toMatchObject({
      diskGB: 96,
      instanceType: "cx42",
      provider: "hetzner",
      region: "fsn1",
      source: "catalog",
    });
    expect(result.resolution.approval).toEqual({
      commandPreview: [],
      requiresMutationApproval: true,
      secretFree: true,
    });
  });

  test("rejects malformed resolver JSON loudly", async () => {
    await expect(
      resolveCloudRuntimeProvision(
        { provider: "hetzner" },
        {
          env: { SETTA_CLI_PATH: "/opt/setta" },
          repoRoot: "/repo",
          execFileRunner: async () => ({ stderr: "", stdout: "not-json" }),
        },
      ),
    ).rejects.toThrow("setta provision resolve did not return valid JSON");
  });

  test("threads AWS placement through resolver requests and responses", async () => {
    const result = await resolveCloudRuntimeProvision(
      {
        awsPlacement: {
          securityGroupId: "sg-explicit123",
          subnetId: "subnet-explicit123",
          vpcId: "vpc-explicit123",
        },
        provider: "aws",
        region: "us-east-1",
        shape: "dev-standard",
      },
      {
        env: { SETTA_CLI_PATH: "/opt/setta" },
        repoRoot: "/repo",
        execFileRunner: async (_command, args) => {
          expect(args).toContain("--aws-vpc-id");
          expect(args).toContain("vpc-explicit123");
          expect(args).toContain("--aws-subnet-id");
          expect(args).toContain("subnet-explicit123");
          expect(args).toContain("--aws-security-group-id");
          expect(args).toContain("sg-explicit123");
          return { stderr: "", stdout: JSON.stringify(awsResolveOutput()) };
        },
      },
    );

    expect(result.resolution.awsPlacement).toEqual({
      defaultVpcRequired: false,
      securityGroupId: "sg-explicit123",
      securityGroupMode: "existing",
      source: "caller",
      subnetId: "subnet-explicit123",
      vpcId: "vpc-explicit123",
    });
  });
});

function shapesOutput() {
  return {
    catalog: {
      defaultProvider: "hetzner",
      providers: [
        {
          displayName: "Hetzner Cloud",
          id: "hetzner",
          imageSelector: {
            description: "Hetzner stable Ubuntu image alias",
            kind: "image_alias",
            value: "ubuntu-24.04",
          },
          mappings: {
            "dev-small": { costClass: "low", instanceType: "cx22" },
            "dev-standard": { costClass: "standard", instanceType: "cx42" },
          },
          pricingUrl: "https://www.hetzner.com/cloud",
          regionPreferences: ["fsn1", "nbg1"],
        },
      ],
      schemaVersion: 1,
      shapes: [
        {
          cpuMin: 2,
          diskFloorGb: 64,
          guide: "2 vCPU / 4 GB RAM",
          id: "dev-small",
          label: "Dev small",
          memoryGbMin: 4,
        },
        {
          cpuMin: 4,
          diskFloorGb: 64,
          guide: "4 vCPU / 16 GB RAM",
          id: "dev-standard",
          label: "Dev standard",
          memoryGbMin: 16,
        },
      ],
    },
    defaultShape: "dev-standard",
    ok: true,
  };
}

function resolveOutput() {
  return {
    candidates: [resolutionOutput()],
    ok: true,
    request: {
      constraints: {
        diskGb: 96,
        intent: "cheap box for agents",
        regionPreference: "fsn1",
        workloadNote: "cheap box for agents",
      },
      provider: "hetzner",
      shape: "dev-standard",
    },
    resolution: resolutionOutput(),
  };
}

function resolutionOutput() {
  return {
    approval: {
      commandPreview: [],
      requiresMutationApproval: true,
      secretFree: true,
    },
    cost: {
      class: "standard",
      description: "catalog cost class",
      kind: "class",
      pricingUrl: "https://www.hetzner.com/cloud",
    },
    diskGb: 96,
    displayName: "Hetzner Cloud",
    imageSelector: {
      description: "Hetzner stable Ubuntu image alias",
      kind: "image_alias",
      value: "ubuntu-24.04",
    },
    instanceType: "cx42",
    machine: {
      cpus: 4,
      diskGb: 96,
      memoryGb: 16,
    },
    provider: "hetzner",
    region: "fsn1",
    regionOptions: ["fsn1", "nbg1"],
    shape: "dev-standard",
    source: "catalog",
  };
}

function awsResolveOutput() {
  const resolution = {
    ...resolutionOutput(),
    awsPlacement: {
      defaultVpcRequired: false,
      securityGroupId: "sg-explicit123",
      securityGroupMode: "existing",
      source: "caller",
      subnetId: "subnet-explicit123",
      vpcId: "vpc-explicit123",
    },
    displayName: "AWS",
    imageSelector: {
      description: "Canonical Ubuntu SSM parameter",
      kind: "aws_ssm_ubuntu_lts",
      value: "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id",
    },
    instanceType: "t3.xlarge",
    provider: "aws",
    region: "us-east-1",
    regionOptions: ["us-east-1"],
  };
  return {
    candidates: [resolution],
    ok: true,
    request: {
      constraints: {
        regionPreference: "us-east-1",
      },
      provider: "aws",
      shape: "dev-standard",
    },
    resolution,
  };
}
