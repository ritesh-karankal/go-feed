# ==============================================================
# Go-Feed Platform
# Composes the reusable infrastructure modules:
# - VPC / Networking
# - Bastion / SSM
# - EKS
# (Container images are hosted on GHCR - no ECR module)
# ==============================================================


# --------------------------------------------------------------
# Network
# --------------------------------------------------------------

module "network" {
  source = "../network"

  project_name = var.project_name
  environment  = var.environment
  cluster_name = var.cluster_name

  vpc_cidr = var.vpc_cidr

  single_nat_gateway = var.single_nat_gateway
}


# --------------------------------------------------------------
# Bastion / SSM Administration Host
# --------------------------------------------------------------

module "bastion" {
  count = var.enable_bastion ? 1 : 0

  source = "../bastion"

  project_name = var.project_name
  environment  = var.environment

  vpc_id = module.network.vpc_id

  public_subnet_id = module.network.public_subnets[0]

  instance_type = var.bastion_instance_type
}


# --------------------------------------------------------------
# Security Group for Private EKS API Access
# --------------------------------------------------------------

resource "aws_security_group" "cluster_access" {
  name        = "${var.cluster_name}-cluster-access"
  description = "Security group controlling access to the private EKS API endpoint"
  vpc_id      = module.network.vpc_id

  # ------------------------------------------------------------
  # Bastion -> EKS API
  #
  # The bastion has no inbound SSH requirement when using SSM.
  # It only needs to reach the private EKS API over HTTPS.
  # ------------------------------------------------------------

  dynamic "ingress" {
    for_each = var.enable_bastion ? [1] : []

    content {
      description     = "HTTPS from SSM bastion to private EKS API"
      from_port       = 443
      to_port         = 443
      protocol        = "tcp"
      security_groups = [module.bastion[0].security_group_id]
    }
  }

  # ------------------------------------------------------------
  # Optional trusted private networks
  #
  # Example:
  # 10.10.0.0/16 -> corporate VPN
  # ------------------------------------------------------------

  dynamic "ingress" {
    for_each = var.cluster_admin_cidrs

    content {
      description = "HTTPS from trusted private network"
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  # ------------------------------------------------------------
  # EKS/control-plane related outbound communication
  # ------------------------------------------------------------

  egress {
    description = "Allow outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.cluster_name}-cluster-access"
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}


# --------------------------------------------------------------
# EKS
# --------------------------------------------------------------

module "eks" {
  source = "../eks"

  project_name = var.project_name
  environment  = var.environment

  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version

  vpc_id          = module.network.vpc_id
  private_subnets = module.network.private_subnets

  cluster_access_security_group_id = aws_security_group.cluster_access.id

  cluster_admin_role_arn = var.cluster_admin_role_arn

  node_instance_types = var.node_instance_types

  node_min_size     = var.node_min_size
  node_max_size     = var.node_max_size
  node_desired_size = var.node_desired_size

  log_retention_days = var.log_retention_days
}


