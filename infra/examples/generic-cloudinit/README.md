# Generic Cloud-Init Example

Provider-neutral example for any Terraform/OpenTofu provider that accepts
plain cloud-init or user-data.

Use this when your provider is not covered by the best-effort examples. Wire
`module.setta_runtime.user_data` into the provider's user-data argument, then
apply `module.setta_runtime.tags` or `module.setta_runtime.labels` wherever
the provider supports metadata.

Run from this directory after generating `setta-cloud-init.yaml`:

```sh
terraform init
terraform plan \
  -var='cloud_init_path=../../setta-cloud-init.yaml' \
  -var='runtime_name=setta-runtime-01'
```

The cloud-init payload contains first-boot secrets. Secure or discard state
after the runtime is paired.
