# DigitalOcean Example

Best-effort DigitalOcean Droplet example for Setta-rendered cloud-init.

The example creates a Droplet from the Ubuntu 24.04 image slug, attaches a
firewall with no inbound rules and outbound internet access, and applies Setta
tags. Configure the provider with `DIGITALOCEAN_TOKEN` in your shell.

Run from this directory after generating `setta-cloud-init.yaml`:

```sh
DIGITALOCEAN_TOKEN=... terraform init
DIGITALOCEAN_TOKEN=... terraform apply \
  -var='cloud_init_path=../../setta-cloud-init.yaml' \
  -var='runtime_name=setta-runtime-01'
```

The cloud-init payload contains first-boot secrets. Secure or discard state
after the runtime is paired.
