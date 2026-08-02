output "instance_id" {
  description = "EC2 instance id for the Setta dev box."
  value       = aws_instance.devbox.id
}

output "instance_name" {
  description = "Name tag used by the operator helper for discovery."
  value       = var.devbox_name
}

output "region" {
  description = "AWS region for the Setta dev box."
  value       = var.region
}

output "availability_zone" {
  description = "Availability zone for the public subnet and instance."
  value       = local.selected_availability_zone
}

output "repo_checkout_path" {
  description = "Prepared repo checkout path on the remote machine."
  value       = var.repo_checkout_path
}

output "default_ports" {
  description = "Standardized loopback ports for Setta and Chrome CDP."
  value = {
    cdp   = var.default_cdp_port
    setta = var.default_setta_port
  }
}

output "discovery_tags" {
  description = "Tags the operator helper can use to rediscover the instance."
  value       = local.discovery_tags
}

output "connection_metadata" {
  description = "Convenience metadata for SSM-based day-to-day operations."
  value = {
    cdp_port             = var.default_cdp_port
    region               = var.region
    repo_checkout_path   = var.repo_checkout_path
    setta_port           = var.default_setta_port
    ssm_start_session    = "aws ssm start-session --region ${var.region} --target ${aws_instance.devbox.id}"
    tunnel_cdp_example   = "aws ssm start-session --region ${var.region} --target ${aws_instance.devbox.id} --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters '{\"host\":[\"127.0.0.1\"],\"portNumber\":[\"${var.default_cdp_port}\"],\"localPortNumber\":[\"${var.default_cdp_port}\"]}'"
    tunnel_setta_example = "aws ssm start-session --region ${var.region} --target ${aws_instance.devbox.id} --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters '{\"host\":[\"127.0.0.1\"],\"portNumber\":[\"${var.default_setta_port}\"],\"localPortNumber\":[\"${var.default_setta_port}\"]}'"
  }
}
