output "droplet_id" {
  value = digitalocean_droplet.setta_runtime.id
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
