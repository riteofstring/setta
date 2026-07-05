import type {
  CloudRuntimeProvisionExistingRecordResult,
  CloudRuntimeProvisionResolution,
} from "@shared/types";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  CloudRuntimeResolutionCard,
  cloudRuntimeTier2Instructions,
} from "./runtime-cloud-resolution-card";
import { cloudRuntimeExistingRecordMessage } from "./runtime-cloud-existing-record";

describe("runtime cloud wizard", () => {
  test("renders the deterministic resolution approval card", () => {
    const html = renderToString(
      <CloudRuntimeResolutionCard
        approval={null}
        authSource="oauth"
        busy={false}
        onApprove={() => {}}
        resolution={resolutionFixture()}
        warnings={["hcloud CLI was not found; using catalog fallback"]}
      />,
    );

    expect(html).toContain("Hetzner Cloud");
    expect(html).toContain("cx42");
    expect(html).toContain("fsn1");
    expect(html).toContain("64 GB");
    expect(html).toContain("ubuntu-24.04");
    expect(html).toContain("OAuth");
    expect(html).toContain("Approve resolution");
    expect(html).toContain("hcloud CLI was not found");
  });

  test("provides provider-specific Tier 2 paste instructions", () => {
    expect(cloudRuntimeTier2Instructions(resolutionFixture())).toEqual([
      "Open Hetzner Cloud > Servers > Create server in the selected location.",
      "Use fsn1 and cx42.",
      "Use image selector ubuntu-24.04.",
      "Set the boot disk to 64 GB or larger.",
      "Paste Setta cloud-init into the Cloud config field.",
    ]);
  });

  test("formats existing-record retry choices without implying another create", () => {
    expect(cloudRuntimeExistingRecordMessage(existingRecordResultFixture())).toBe(
      "A cloud provisioning record for hetzner:setta-worker already exists with status succeeded. No provider create command was run. Available choices: Inspect existing record, Adopt existing runtime, Review teardown, Use a different runtime name.",
    );
  });
});

function resolutionFixture(): CloudRuntimeProvisionResolution {
  return {
    approval: {
      commandPreview: [],
      requiresMutationApproval: true,
      secretFree: true,
    },
    cost: {
      amount: null,
      class: "standard",
      currency: null,
      description: "catalog cost class",
      kind: "class",
      pricingUrl: "https://www.hetzner.com/cloud",
    },
    diskGB: 64,
    displayName: "Hetzner Cloud",
    imageSelector: {
      description: "Hetzner stable Ubuntu 24.04 image alias",
      kind: "image_alias",
      value: "ubuntu-24.04",
    },
    instanceType: "cx42",
    machine: {
      cpus: 4,
      diskGB: 64,
      gpuClass: null,
      memoryGB: 16,
    },
    provider: "hetzner",
    region: "fsn1",
    regionOptions: ["fsn1", "nbg1"],
    shape: "dev-standard",
    source: "catalog",
    warnings: [],
  };
}

function existingRecordResultFixture(): CloudRuntimeProvisionExistingRecordResult {
  return {
    creationRecord: {
      createdAt: "2026-07-07T10:00:00.000Z",
      expectedResourceName: "setta-worker",
      lastError: null,
      provider: "hetzner",
      recordId: "hetzner:setta-worker",
      resourceId: "123",
      runtimeName: "setta-worker",
      status: "succeeded",
      teardownReady: true,
      updatedAt: "2026-07-07T10:01:00.000Z",
    },
    mode: "existing_record",
    nextActions: [
      {
        description: "Review creation record hetzner:setta-worker.",
        id: "inspect_existing_record",
        label: "Inspect existing record",
        mutating: false,
      },
      {
        description: "Use the existing runtime.",
        id: "adopt_existing_runtime",
        label: "Adopt existing runtime",
        mutating: false,
      },
      {
        description: "Review teardown.",
        id: "tear_down_existing_resource",
        label: "Review teardown",
        mutating: true,
      },
      {
        description: "Resolve again.",
        id: "use_different_runtime_name",
        label: "Use a different runtime name",
        mutating: false,
      },
    ],
    ok: false,
    provider: "hetzner",
    runtimeName: "setta-worker",
    warnings: [],
  };
}
