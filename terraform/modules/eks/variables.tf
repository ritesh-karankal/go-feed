variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "cluster_name" {
  type = string
}

variable "cluster_version" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnets" {
  type = list(string)
}

variable "cluster_access_security_group_id" {
  type = string
}

variable "cluster_admin_role_arn" {
  description = "Optional IAM role granted EKS cluster administrator access."
  type        = string
  default     = null
}

variable "node_instance_types" {
  type = list(string)

  default = [
    "t3.large"
  ]
}

variable "node_min_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 6
}

variable "node_desired_size" {
  type    = number
  default = 2
}

variable "log_retention_days" {
  type    = number
  default = 30
}