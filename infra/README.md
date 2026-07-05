# Setta Runtime Infra Kit

This directory is the Phase 5 OpenTofu/Terraform kit for technical users who
want repeatable BYO-cloud provisioning without Setta-specific cloud code.

The supported surface is `modules/setta-runtime-cloudinit`. It does not render
Setta bootstrap scripts, mint Tailscale keys, or choose cloud resources. Those
contracts stay owned by `setta provision render-cloudinit`. The module accepts
the rendered cloud-init payload and exposes provider-friendly user-data,
tags, labels, and digests.

The provider examples under `examples/` are best-effort starting points. They
use official Terraform providers and normal provider resources, but they are
not the Setta one-click path and they are not a managed provider abstraction.
Inspect them against your account, quota, networking, and billing model before
applying.

## Secret Handling

Rendered Setta cloud-init contains first-boot secrets: a Tailscale auth key,
a seeded pairing-token hash, and the setup-attestation key. Terraform and
OpenTofu state can retain resource arguments even when variables and outputs
are marked sensitive. Treat any state written by these examples as sensitive
until the VM has booted, joined the tailnet, paired, and the Tailscale auth key
has been consumed.

Use local encrypted state or a backend with access controls. Do not commit
state, `*.tfvars`, generated cloud-init, or plan files.

## Generate Cloud-Init

Generate user data with Setta first, then pass the generated file into an
example:

```sh
setta provision render-cloudinit --json \
  --runtime-name setta-runtime-01 \
  --tailscale-auth-key "$SETTA_TAILSCALE_AUTH_KEY" \
  --pairing-token-hash "$SETTA_PAIRING_TOKEN_HASH" \
  --provision-id "$SETTA_PROVISION_ID" \
  --provision-attestation-key "$SETTA_PROVISION_ATTESTATION_KEY" \
  --expires-at "$SETTA_PROVISION_EXPIRES_AT" \
  --setta-version v1.2.3 \
  --installer-sha256 "$SETTA_INSTALLER_SHA256" \
  --minisign-public-key "$SETTA_MINISIGN_PUBLIC_KEY" \
  > setta-cloudinit.json

jq -r .cloudInit setta-cloudinit.json > setta-cloud-init.yaml
jq -r .cloudInitSha256 setta-cloudinit.json
```

Then run `terraform` or `tofu` from one of the example directories and pass
`cloud_init_path=../../setta-cloud-init.yaml`, plus the provider-specific
networking variables required by that example.

## Examples

- `examples/aws`: EC2 instance with an explicit VPC/subnet and a no-ingress
  security group.
- `examples/gcp`: Compute Engine instance with a target-tagged deny-ingress
  firewall rule.
- `examples/hetzner`: Hetzner Cloud server with a firewall attached and
  Setta labels.
- `examples/digitalocean`: DigitalOcean Droplet with a firewall attached and
  Setta tags.
- `examples/generic-cloudinit`: provider-neutral adapter showing the supported
  module outputs for any user-data-capable provider.

The examples intentionally do not use the Tailscale provider. Setta's
provisioning flow owns Tailscale auth-key minting and embeds the one-time key
in cloud-init; adding a Terraform-managed Tailscale credential path would
broaden the credential surface beyond this docs-tier kit.
