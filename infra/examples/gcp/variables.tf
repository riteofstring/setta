variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "GCP region."
  type        = string
}

variable "zone" {
  description = "GCP zone."
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

variable "network_self_link" {
  description = "Network self link or provider-accepted network identifier for the deny-ingress firewall."
  type        = string
}

variable "subnetwork_self_link" {
  description = "Subnetwork self link or provider-accepted subnetwork identifier for the instance."
  type        = string
}

variable "machine_type" {
  description = "Compute Engine machine type."
  type        = string
  default     = "e2-standard-4"
}

variable "disk_gb" {
  description = "Boot disk size in GiB. Must satisfy the Setta shape floor used to render cloud-init."
  type        = number
  default     = 64
}

variable "disk_type" {
  description = "Boot disk type."
  type        = string
  default     = "pd-balanced"
}

variable "image_family" {
  description = "Ubuntu image family resolved from ubuntu-os-cloud."
  type        = string
  default     = "ubuntu-2404-lts-amd64"
}

variable "assign_public_ip" {
  description = "Whether to add an ephemeral public IP. The target-tagged firewall denies inbound traffic."
  type        = bool
  default     = false
}

variable "network_tags" {
  description = "Additional GCP network tags."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Additional free-form metadata passed through the shared module."
  type        = map(string)
  default     = {}
}

variable "labels" {
  description = "Additional GCP labels."
  type        = map(string)
  default     = {}
}
