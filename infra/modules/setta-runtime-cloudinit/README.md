# setta-runtime-cloudinit

Supported OpenTofu/Terraform module for passing Setta-rendered cloud-init into
provider VM resources.

This module is deliberately small. It validates the Setta runtime name and
cloud-init shape, computes the user-data digest, and exposes provider-specific
metadata maps. It does not know how to bootstrap Setta; the Go CLI owns that
contract through `setta provision render-cloudinit`.

## Usage

```hcl
module "setta_runtime" {
  source = "../../modules/setta-runtime-cloudinit"

  runtime_name         = "setta-runtime-01"
  cloud_init           = file("setta-cloud-init.yaml")
  cloud_init_sha256    = "optional-renderer-digest"
  additional_tags      = {}
  additional_labels    = {}
}
```

Use `module.setta_runtime.user_data` as the provider resource's cloud-init or
user-data field. Use `module.setta_runtime.tags` for providers with free-form
tags and `module.setta_runtime.labels` for providers that require label-safe
keys such as GCP or Hetzner.

When `cloud_init_sha256` is provided, the module exposes
`user_data_sha256_matches_expected` so callers can confirm Terraform/OpenTofu
read the same payload that Setta rendered.

## State Warning

The `cloud_init` input and `user_data` output are marked sensitive, but
Terraform/OpenTofu state may still contain the rendered payload after a
provider resource consumes it. Secure or discard state according to your threat
model.
