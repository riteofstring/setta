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

variable "region" {
  description = "DigitalOcean region."
  type        = string
  default     = "nyc3"
}

variable "size" {
  description = "DigitalOcean Droplet size."
  type        = string
  default     = "s-4vcpu-16gb"
}

variable "image" {
  description = "DigitalOcean image slug."
  type        = string
  default     = "ubuntu-24-04-x64"
}

variable "ssh_keys" {
  description = "Optional DigitalOcean SSH key IDs or fingerprints for break-glass access."
  type        = list(string)
  default     = []
}

variable "extra_tags" {
  description = "Additional DigitalOcean Droplet tags."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Additional free-form metadata passed through the shared module."
  type        = map(string)
  default     = {}
}

variable "labels" {
  description = "Additional label-safe metadata passed through the shared module."
  type        = map(string)
  default     = {}
}
