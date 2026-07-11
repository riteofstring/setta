# GCP Example

Best-effort Compute Engine example for Setta-rendered cloud-init.

The example resolves the current Ubuntu LTS image from the
`ubuntu-os-cloud` image family, creates an instance, and adds a target-tagged
deny-ingress firewall rule for that runtime. Provide an explicit network and
subnetwork; the example does not assume the default network is safe.

Run from this directory after generating `setta-cloud-init.yaml`:

```sh
terraform init
terraform apply \
  -var='cloud_init_path=../../setta-cloud-init.yaml' \
  -var='runtime_name=setta-runtime-01' \
  -var='project_id=my-project' \
  -var='region=us-central1' \
  -var='zone=us-central1-a' \
  -var='network_self_link=projects/my-project/global/networks/my-network' \
  -var='subnetwork_self_link=projects/my-project/regions/us-central1/subnetworks/my-subnet'
```

The cloud-init payload contains first-boot secrets. Secure or discard state
after the runtime is paired.
