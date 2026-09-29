module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "21.25.0"

  name               = var.cluster_name
  kubernetes_version = var.cluster_version

  vpc_id                   = var.vpc_id
  subnet_ids               = var.private_subnets
  control_plane_subnet_ids = var.private_subnets

  # Private Kubernetes API
  endpoint_private_access = true
  endpoint_public_access  = false

  # Modern EKS authentication
  authentication_mode = "API"

  # KMS-backed Kubernetes secrets encryption
  create_kms_key = true

  encryption_config = {
    resources = ["secrets"]
  }

  # Control-plane logging
  enabled_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler"
  ]

  cloudwatch_log_group_retention_in_days = var.log_retention_days

  # EKS managed addons
  addons = {
    coredns = {
      most_recent = true
    }

    eks-pod-identity-agent = {
      before_compute = true
      most_recent    = true
    }

    kube-proxy = {
      most_recent = true
    }

    vpc-cni = {
      before_compute = true
      most_recent    = true
    }

    aws-ebs-csi-driver = {
      most_recent = true

      pod_identity_association = [{
        role_arn        = aws_iam_role.ebs_csi_driver.arn
        service_account = "ebs-csi-controller-sa"
      }]
    }
  }

  # Access control
  enable_cluster_creator_admin_permissions = var.cluster_admin_role_arn == null

  access_entries = var.cluster_admin_role_arn == null ? {} : {
    platform_admin = {
      principal_arn = var.cluster_admin_role_arn

      policy_associations = {
        admin = {
          policy_arn = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

          access_scope = {
            type = "cluster"
          }
        }
      }
    }
  }

  # Additional security group allows access to private API
  additional_security_group_ids = [
    var.cluster_access_security_group_id
  ]

  eks_managed_node_groups = {
    system = {
      name = "${var.cluster_name}-system"

      ami_type       = "AL2023_x86_64_STANDARD"
      instance_types = var.node_instance_types

      capacity_type = "ON_DEMAND"

      min_size     = var.node_min_size
      max_size     = var.node_max_size
      desired_size = var.node_desired_size

      subnet_ids = var.private_subnets

      disk_size = 50

      labels = {
        Environment = var.environment
        NodePool    = "system"
      }

      metadata_options = {
        http_endpoint               = "enabled"
        http_tokens                 = "required"
        http_put_response_hop_limit = 1
        instance_metadata_tags      = "disabled"
      }

      update_config = {
        max_unavailable_percentage = 33
      }

      node_repair_config = {
        enabled = true
      }

      tags = {
        Name = "${var.cluster_name}-system"
      }
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}