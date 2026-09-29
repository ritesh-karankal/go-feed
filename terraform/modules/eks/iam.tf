# --------------------------------------------------------------
# Shared Pod Identity trust policy
# Reused by every role that uses EKS Pod Identity.
# --------------------------------------------------------------

data "aws_iam_policy_document" "pod_identity_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole", "sts:TagSession"]

    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
  }
}


# --------------------------------------------------------------
# IAM Role — EBS CSI Driver (EKS Pod Identity)
#
# Allows the ebs-csi-controller to create/attach/delete EBS
# volumes on behalf of PersistentVolumeClaims.
# --------------------------------------------------------------

resource "aws_iam_role" "ebs_csi_driver" {
  name               = "${var.cluster_name}-ebs-csi-driver"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_assume.json

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_iam_role_policy_attachment" "ebs_csi_driver" {
  role       = aws_iam_role.ebs_csi_driver.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}


# --------------------------------------------------------------
# IAM Role — AWS Load Balancer Controller (EKS Pod Identity)
#
# Allows the LBC to provision ALBs and NLBs in response to
# Ingress and Service resources.
# --------------------------------------------------------------

resource "aws_iam_policy" "lbc" {
  name        = "${var.cluster_name}-aws-load-balancer-controller"
  description = "IAM policy for the AWS Load Balancer Controller"
  policy      = file("${path.module}/files/lbc_iam_policy.json")

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_iam_role" "lbc" {
  name               = "${var.cluster_name}-aws-load-balancer-controller"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_assume.json

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_iam_role_policy_attachment" "lbc" {
  role       = aws_iam_role.lbc.name
  policy_arn = aws_iam_policy.lbc.arn
}

# Binds the IAM role to the LBC Kubernetes service account via Pod Identity.
# The LBC Helm chart creates this service account in kube-system.
resource "aws_eks_pod_identity_association" "lbc" {
  cluster_name    = module.eks.cluster_name
  namespace       = "kube-system"
  service_account = "aws-load-balancer-controller"
  role_arn        = aws_iam_role.lbc.arn
}
