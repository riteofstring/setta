output "runtime_name" {
  value = module.setta_runtime.runtime_name
}

output "user_data" {
  value     = module.setta_runtime.user_data
  sensitive = true
}

output "user_data_sha256" {
  value = module.setta_runtime.user_data_sha256
}

output "user_data_sha256_matches_expected" {
  value = module.setta_runtime.user_data_sha256_matches_expected
}

output "tags" {
  value = module.setta_runtime.tags
}

output "labels" {
  value = module.setta_runtime.labels
}
