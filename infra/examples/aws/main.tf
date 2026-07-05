terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.53.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "setta_runtime" {
  source = "../../modules/setta-runtime-cloudinit"

  runtime_name         = var.runtime_name
  cloud_init           = file(var.cloud_init_path)
  cloud_init_sha256    = var.cloud_init_sha256
  additional_tags      = var.tags
  additional_labels    = var.labels
}

data "aws_ssm_parameter" "ubuntu_ami" {
  name = var.ami_ssm_parameter
}

resource "aws_security_group" "setta_runtime" {
  name_prefix = "${var.runtime_name}-setta-"
  description = "Setta runtime: no public ingress, outbound internet for bootstrap"
  vpc_id      = var.vpc_id

  egress {
    description      = "Outbound internet for Tailscale and Setta bootstrap"
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = merge(module.setta_runtime.tags, {
    Name = "${var.runtime_name}-setta"
  })
}

resource "aws_instance" "setta_runtime" {
  ami                         = data.aws_ssm_parameter.ubuntu_ami.value
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  associate_public_ip_address = var.associate_public_ip_address
  vpc_security_group_ids      = concat([aws_security_group.setta_runtime.id], var.extra_security_group_ids)
  key_name                    = var.ssh_key_name
  user_data                   = module.setta_runtime.user_data
  user_data_replace_on_change = true

  root_block_device {
    volume_size = var.disk_gb
    volume_type = "gp3"
  }

  tags = merge(module.setta_runtime.tags, {
    Name = var.runtime_name
  })
}
