output "vpc_id" {
  description = "VPC ID"
  value       = module.platform.vpc_id
}

output "cluster_name" {
  description = "EKS Cluster Name"
  value       = module.platform.cluster_name
}

output "cluster_endpoint" {
  description = "EKS API Endpoint"
  value       = module.platform.cluster_endpoint
}


output "bastion_instance_id" {
  description = "SSM Bastion Instance ID"
  value       = module.platform.bastion_instance_id
}

output "bastion_private_ip" {
  description = "SSM Bastion Private IP"
  value       = module.platform.bastion_private_ip
}

output "kubectl_command" {
  description = "AWS CLI Command to update local kubeconfig"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.platform.cluster_name}"
}