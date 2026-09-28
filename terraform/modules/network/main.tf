data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 3)
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "6.7.3"

  name = "${var.project_name}-${var.environment}-vpc"
  cidr = var.vpc_cidr

  azs = local.azs

  # Private subnets: /20 blocks (4096 IPs each — room for VPC CNI pod IPs)
  # 10.0.16.0/20, 10.0.32.0/20, 10.0.48.0/20
  private_subnets = [
    for k, az in local.azs :
    cidrsubnet(var.vpc_cidr, 4, k + 1)
  ]

  # Public subnets: /24 blocks (256 IPs each — NAT Gateways + LBs)
  # 10.0.0.0/24, 10.0.1.0/24, 10.0.2.0/24
  public_subnets = [
    for k, az in local.azs :
    cidrsubnet(var.vpc_cidr, 8, k)
  ]

  enable_dns_hostnames = true
  enable_dns_support   = true

  enable_nat_gateway = true
  single_nat_gateway = var.single_nat_gateway

  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"

    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"

    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}