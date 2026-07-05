locals {
  cloud_init_sha256 = sha256(nonsensitive(var.cloud_init))

  required_tags = {
    "setta:runtime"      = "true"
    "setta:runtime_name" = var.runtime_name
    "setta:created_by"   = "user"
  }

  required_labels = {
    setta_runtime      = "true"
    setta_runtime_name = var.runtime_name
    setta_created_by   = "user"
  }
}

output "runtime_name" {
  description = "Setta runtime hostname."
  value       = var.runtime_name
}

output "user_data" {
  description = "Sensitive Setta cloud-init payload for provider user-data fields."
  value       = var.cloud_init
  sensitive   = true
}

output "user_data_sha256" {
  description = "SHA-256 digest of the user-data value passed through this module."
  value       = local.cloud_init_sha256
}

output "expected_user_data_sha256" {
  description = "Optional renderer-provided SHA-256 digest, when supplied by the caller."
  value       = var.cloud_init_sha256
}

output "user_data_sha256_matches_expected" {
  description = "Whether the optional renderer digest matches the user-data value read by Terraform/OpenTofu."
  value       = var.cloud_init_sha256 == null ? null : lower(var.cloud_init_sha256) == local.cloud_init_sha256
}

output "tags" {
  description = "Free-form Setta resource tags for providers that support map tags."
  value       = merge(var.additional_tags, local.required_tags)
}

output "labels" {
  description = "Label-safe Setta resource metadata for providers whose labels do not accept colon characters."
  value       = merge(var.additional_labels, local.required_labels)
}
