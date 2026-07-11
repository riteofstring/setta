# Hetzner Cloud Example

Best-effort Hetzner Cloud example for Setta-rendered cloud-init.

The example creates an `hcloud_server` with the Ubuntu 24.04 image alias,
attaches a firewall with no inbound rules, and applies Setta labels. Configure
the provider with `HCLOUD_TOKEN` in your shell.

Run from this directory after generating `setta-cloud-init.yaml`:

```sh
HCLOUD_TOKEN=... terraform init
HCLOUD_TOKEN=... terraform apply \
  -var='cloud_init_path=../../setta-cloud-init.yaml' \
  -var='runtime_name=setta-runtime-01'
```

The cloud-init payload contains first-boot secrets. Secure or discard state
after the runtime is paired.
