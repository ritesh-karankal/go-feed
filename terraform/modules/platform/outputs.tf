output "vpc_id" {
  value = module.network.vpc_id
}

output "private_subnets" {
  value = module.network.private_subnets
}

output "public_subnets" {
  value = module.network.public_subnets
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "cluster_certificate_authority_data" {
  value     = module.eks.cluster_certificate_authority_data
  sensitive = true
}


output "bastion_instance_id" {
  value = var.enable_bastion ? module.bastion[0].instance_id : null
}

output "bastion_private_ip" {
  value = var.enable_bastion ? module.bastion[0].private_ip : null
}