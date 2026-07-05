# AWS Example

Best-effort EC2 example for Setta-rendered cloud-init.

The example resolves the current Ubuntu LTS AMI through AWS public SSM
parameters, creates an EC2 instance, and attaches a security group with no
ingress rules and outbound internet access. Provide an explicit VPC and subnet;
the example does not rely on a default VPC.

Run from this directory after generating `setta-cloud-init.yaml`:

```sh
terraform init
terraform apply \
  -var='cloud_init_path=../../setta-cloud-init.yaml' \
  -var='runtime_name=setta-runtime-01' \
  -var='aws_region=us-east-1' \
  -var='vpc_id=vpc-...' \
  -var='subnet_id=subnet-...'
```

The cloud-init payload contains first-boot secrets. Secure or discard state
after the runtime is paired.
