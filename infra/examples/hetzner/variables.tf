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

variable "server_type" {
  description = "Hetzner Cloud server type."
  type        = string
  default     = "cx42"
}

variable "location" {
  description = "Hetzner Cloud location."
  type        = string
  default     = "fsn1"
}

variable "image" {
  description = "Hetzner image alias."
  type        = string
  default     = "ubuntu-24.04"
}

variable "public_ipv4_enabled" {
  description = "Whether to attach public IPv4. The attached firewall has no inbound rules."
  type        = bool
  default     = true
}

variable "public_ipv6_enabled" {
  description = "Whether to attach public IPv6. The attached firewall has no inbound rules."
  type        = bool
  default     = true
}

variable "extra_firewall_ids" {
  description = "Additional Hetzner firewall IDs to attach. They must not open unintended public ingress."
  type        = list(number)
  default     = []
}

variable "tags" {
  description = "Additional free-form metadata passed through the shared module."
  type        = map(string)
  default     = {}
}

variable "labels" {
  description = "Additional Hetzner labels."
  type        = map(string)
  default     = {}
}
