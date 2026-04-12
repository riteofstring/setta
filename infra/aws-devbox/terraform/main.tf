provider "aws" {
  region = var.region
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

locals {
  selected_availability_zone = coalesce(
    var.availability_zone,
    data.aws_availability_zones.available.names[0]
  )

  discovery_tags = {
    Name      = var.devbox_name
    Project   = "setta"
    Service   = "aws-devbox"
    ManagedBy = "terraform"
  }

  common_tags = merge(
    local.discovery_tags,
    {
      CostCenter  = var.cost_center
      Environment = "dev"
      Owner       = var.owner_tag
    },
    var.extra_tags
  )

  node_version = trimspace(file("${path.module}/../../../scripts/node_version.txt"))
}

resource "aws_vpc" "devbox" {
  cidr_block           = "10.70.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, { Name = "${var.devbox_name}-vpc" })
}

resource "aws_internet_gateway" "devbox" {
  vpc_id = aws_vpc.devbox.id

  tags = merge(local.common_tags, { Name = "${var.devbox_name}-igw" })
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.devbox.id
  cidr_block              = "10.70.1.0/24"
  availability_zone       = local.selected_availability_zone
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, { Name = "${var.devbox_name}-public-subnet" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.devbox.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.devbox.id
  }

  tags = merge(local.common_tags, { Name = "${var.devbox_name}-public-rt" })
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "devbox" {
  name        = "${var.devbox_name}-sg"
  description = "No inbound app exposure; outbound-only access for the Setta dev box."
  vpc_id      = aws_vpc.devbox.id

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = merge(local.common_tags, { Name = "${var.devbox_name}-sg" })
}

data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "devbox" {
  name               = "${var.devbox_name}-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.devbox.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "devbox" {
  name = "${var.devbox_name}-instance-profile"
  role = aws_iam_role.devbox.name

  tags = local.common_tags
}

resource "aws_instance" "devbox" {
  ami                                  = data.aws_ami.ubuntu.id
  instance_type                        = var.instance_type
  subnet_id                            = aws_subnet.public.id
  vpc_security_group_ids               = [aws_security_group.devbox.id]
  iam_instance_profile                 = aws_iam_instance_profile.devbox.name
  associate_public_ip_address          = true
  instance_initiated_shutdown_behavior = "stop"
  user_data = templatefile("${path.module}/../cloud-init.yaml", {
    cdp_port            = tostring(var.default_cdp_port)
    node_version        = local.node_version
    repo_checkout_path  = var.repo_checkout_path
    repo_clone_url      = var.repo_clone_url
    setta_port          = tostring(var.default_setta_port)
    ssh_authorized_keys = var.ssh_authorized_keys
  })

  root_block_device {
    delete_on_termination = true
    encrypted             = true
    volume_size           = var.root_volume_size_gb
    volume_type           = "gp3"
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  tags = local.common_tags
}
