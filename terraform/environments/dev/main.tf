terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "go-feed-terraform-state-go-feed"
    key          = "dev/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

module "platform" {
  source = "../../modules/platform"

  aws_region   = var.aws_region
  project_name = var.project_name
  environment  = var.environment
  vpc_cidr     = var.vpc_cidr

  cluster_name           = var.cluster_name
  cluster_version        = var.cluster_version
  single_nat_gateway     = var.single_nat_gateway
  cluster_admin_role_arn = var.cluster_admin_role_arn
  cluster_admin_cidrs    = var.cluster_admin_cidrs

  node_instance_types = var.node_instance_types
  node_min_size       = var.node_min_size
  node_max_size       = var.node_max_size
  node_desired_size   = var.node_desired_size

  log_retention_days    = var.log_retention_days
  enable_bastion       = var.enable_bastion
  bastion_instance_type = var.bastion_instance_type
}