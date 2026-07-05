terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "7.39.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

locals {
  network_tags = distinct(concat(var.network_tags, ["setta-runtime", var.runtime_name]))
}

module "setta_runtime" {
  source = "../../modules/setta-runtime-cloudinit"

  runtime_name         = var.runtime_name
  cloud_init           = file(var.cloud_init_path)
  cloud_init_sha256    = var.cloud_init_sha256
  additional_tags      = var.tags
  additional_labels    = var.labels
}

data "google_compute_image" "ubuntu_lts" {
  family  = var.image_family
  project = "ubuntu-os-cloud"
}

resource "google_compute_firewall" "deny_ingress" {
  name        = "${var.runtime_name}-deny-ingress"
  network     = var.network_self_link
  direction   = "INGRESS"
  priority    = 900
  target_tags = local.network_tags

  deny {
    protocol = "all"
  }

  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_instance" "setta_runtime" {
  name         = var.runtime_name
  machine_type = var.machine_type
  zone         = var.zone
  labels       = module.setta_runtime.labels
  tags         = local.network_tags

  boot_disk {
    initialize_params {
      image = data.google_compute_image.ubuntu_lts.self_link
      size  = var.disk_gb
      type  = var.disk_type
    }
  }

  network_interface {
    subnetwork = var.subnetwork_self_link

    dynamic "access_config" {
      for_each = var.assign_public_ip ? [1] : []
      content {}
    }
  }

  metadata = {
    user-data = module.setta_runtime.user_data
  }
}
