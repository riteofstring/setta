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

variable "tags" {
  description = "Additional free-form tags."
  type        = map(string)
  default     = {}
}

variable "labels" {
  description = "Additional label-safe metadata."
  type        = map(string)
  default     = {}
}
