output "instance_self_link" {
  value = google_compute_instance.setta_runtime.self_link
}

output "runtime_name" {
  value = module.setta_runtime.runtime_name
}

output "user_data_sha256" {
  value = module.setta_runtime.user_data_sha256
}

output "user_data_sha256_matches_expected" {
  value = module.setta_runtime.user_data_sha256_matches_expected
}
