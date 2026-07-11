variable "runtime_name" {
  description = "Tailscale hostname for the Setta runtime. Must match the Setta cloud-init renderer hostname contract."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$", var.runtime_name))
    error_message = "runtime_name must be a lowercase DNS hostname label."
  }
}

variable "cloud_init" {
  description = "Rendered Setta cloud-init from `setta provision render-cloudinit`. This value contains first-boot secrets."
  type        = string
  sensitive   = true

  validation {
    condition     = startswith(trimspace(var.cloud_init), "#cloud-config")
    error_message = "cloud_init must be the Setta-rendered #cloud-config payload."
  }
}

variable "cloud_init_sha256" {
  description = "Optional SHA-256 digest emitted by `setta provision render-cloudinit`; exposed for caller-side audit output."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.cloud_init_sha256 == null ? true : can(regex("^[a-f0-9]{64}$", lower(var.cloud_init_sha256)))
    error_message = "cloud_init_sha256 must be a 64-character hexadecimal SHA-256 digest."
  }
}

variable "additional_tags" {
  description = "Additional free-form tags to merge with Setta's required tags. Required Setta tags win on key conflicts."
  type        = map(string)
  default     = {}
}

variable "additional_labels" {
  description = "Additional provider label values to merge with Setta's required label-safe metadata. Required Setta labels win on key conflicts."
  type        = map(string)
  default     = {}
}
