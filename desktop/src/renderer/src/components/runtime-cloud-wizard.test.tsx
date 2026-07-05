import type { CloudRuntimeProvisionResolution } from "@shared/types";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  CloudRuntimeResolutionCard,
  cloudRuntimeTier2Instructions,
} from "./runtime-cloud-resolution-card";

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
