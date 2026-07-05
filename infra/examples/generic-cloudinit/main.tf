module "setta_runtime" {
  source = "../../modules/setta-runtime-cloudinit"

  runtime_name         = var.runtime_name
  cloud_init           = file(var.cloud_init_path)
  cloud_init_sha256    = var.cloud_init_sha256
  additional_tags      = var.tags
  additional_labels    = var.labels
}
