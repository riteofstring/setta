terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "2.94.0"
    }
  }
}

provider "digitalocean" {}

locals {
  droplet_tags = distinct(concat(var.extra_tags, ["setta-runtime", "setta-runtime-${var.runtime_name}"]))
}

module "setta_runtime" {
  source = "../../modules/setta-runtime-cloudinit"

  runtime_name      = var.runtime_name
  cloud_init        = file(var.cloud_init_path)
  cloud_init_sha256 = var.cloud_init_sha256
  additional_tags   = var.tags
  additional_labels = var.labels
}

resource "digitalocean_droplet" "setta_runtime" {
  name      = var.runtime_name
  image     = var.image
  region    = var.region
  size      = var.size
  user_data = module.setta_runtime.user_data
  tags      = local.droplet_tags
  ssh_keys  = var.ssh_keys
}

resource "digitalocean_firewall" "setta_runtime" {
  name        = "${var.runtime_name}-setta"
  droplet_ids = [digitalocean_droplet.setta_runtime.id]

  outbound_rule {
    protocol              = "tcp"
    port_range            = "all"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "all"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}
