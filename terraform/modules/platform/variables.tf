variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "cluster_name" {
  type = string
}

variable "cluster_version" {
  type = string
}

variable "single_nat_gateway" {
  type = bool
}

variable "cluster_admin_role_arn" {
  type    = string
  default = null
}

variable "cluster_admin_cidrs" {
  description = "Private/trusted CIDRs allowed to reach the private EKS endpoint."
  type        = list(string)
  default     = []
}

variable "node_instance_types" {
  type = list(string)
}

variable "node_min_size" {
  type = number
}

variable "node_max_size" {
  type = number
}

variable "node_desired_size" {
  type = number
}

variable "log_retention_days" {
  type = number
}

variable "enable_bastion" {
  type = bool
}

variable "bastion_instance_type" {
  type = string
}

