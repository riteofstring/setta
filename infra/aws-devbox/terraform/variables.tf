variable "region" {
  description = "AWS region for the remote dev box."
  type        = string
  default     = "us-east-1"
}

variable "availability_zone" {
  description = "Optional availability zone override. Defaults to the first available zone in the selected region."
  type        = string
  default     = null
}

variable "devbox_name" {
  description = "Name tag applied to the EC2 instance and discovery resources."
  type        = string
  default     = "setta-devbox"
}

variable "instance_type" {
  description = "EC2 instance type for the remote development box."
  type        = string
  default     = "t3a.xlarge"
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size in GiB."
  type        = number
  default     = 100
}

variable "repo_clone_url" {
  description = "Optional git clone URL for the repo checkout. Leave empty to create the checkout directory without cloning."
  type        = string
  default     = ""
}

variable "repo_checkout_path" {
  description = "Absolute checkout path to prepare on the remote machine."
  type        = string
  default     = "/home/ubuntu/dev/setta"
}

variable "ssh_authorized_keys" {
  description = "SSH public keys allowed to log into the devbox over SSM-backed SSH."
  type        = list(string)
  default     = []
}

variable "owner_tag" {
  description = "Owner tag for cost attribution."
  type        = string
  default     = "jeff"
}

variable "cost_center" {
  description = "Cost tag for the dev box."
  type        = string
  default     = "setta-devbox"
}

variable "default_setta_port" {
  description = "Standard loopback port for Setta on the remote box."
  type        = number
  default     = 8000
}

variable "default_cdp_port" {
  description = "Standard loopback port for Chrome remote debugging on the remote box."
  type        = number
  default     = 9222
}

variable "extra_tags" {
  description = "Additional resource tags."
  type        = map(string)
  default     = {}
}
