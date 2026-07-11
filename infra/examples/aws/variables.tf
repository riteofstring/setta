variable "aws_region" {
  description = "AWS region for the runtime."
  type        = string
}

variable "runtime_name" {
  description = "Setta runtime hostname."
  type        = string
}

variable "cloud_init_path" {
  description = "Path to the Setta-rendered cloud-init YAML file."
  type        = string
}

variable "cloud_init_sha256" {
  description = "Optional digest emitted by `setta provision render-cloudinit`."
  type        = string
  default     = null
  nullable    = true
}

variable "vpc_id" {
  description = "VPC where the runtime security group will be created."
  type        = string
}

variable "subnet_id" {
  description = "Subnet for the runtime instance. Ensure it has outbound internet through a public IP or NAT."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type."
  type        = string
  default     = "t3.xlarge"
}

variable "disk_gb" {
  description = "Root volume size in GiB. Must satisfy the Setta shape floor used to render cloud-init."
  type        = number
  default     = 64
}

variable "ami_ssm_parameter" {
  description = "AWS public SSM parameter resolving the current Ubuntu LTS AMI in the selected region."
  type        = string
  default     = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
}

variable "associate_public_ip_address" {
  description = "Whether to attach a public IPv4 address. The security group still has no ingress rules."
  type        = bool
  default     = false
}

variable "extra_security_group_ids" {
  description = "Additional security groups to attach. They must not open unintended public ingress."
  type        = list(string)
  default     = []
}

variable "ssh_key_name" {
  description = "Optional EC2 key pair for break-glass access."
  type        = string
  default     = null
  nullable    = true
}

variable "tags" {
  description = "Additional AWS tags."
  type        = map(string)
  default     = {}
}

variable "labels" {
  description = "Additional label-safe metadata passed through the shared module."
  type        = map(string)
  default     = {}
}
