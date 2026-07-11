terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "1.66.0"
    }
  }
}

provider "hcloud" {}

module "setta_runtime" {
  source = "../../modules/setta-runtime-cloudinit"

  runtime_name      = var.runtime_name
  cloud_init        = file(var.cloud_init_path)
  cloud_init_sha256 = var.cloud_init_sha256
  additional_tags   = var.tags
  additional_labels = var.labels
}

resource "hcloud_firewall" "setta_runtime" {
  name = "${var.runtime_name}-setta"
}

resource "hcloud_server" "setta_runtime" {
  name        = var.runtime_name
  image       = var.image
  server_type = var.server_type
  location    = var.location
  user_data   = module.setta_runtime.user_data
  labels      = module.setta_runtime.labels
  firewall_ids = concat(
    [hcloud_firewall.setta_runtime.id],
    var.extra_firewall_ids,
  )

  public_net {
    ipv4_enabled = var.public_ipv4_enabled
    ipv6_enabled = var.public_ipv6_enabled
  }
}
