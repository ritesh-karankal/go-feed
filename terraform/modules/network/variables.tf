variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "cluster_name" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "single_nat_gateway" {
  description = "Use one NAT gateway. Recommended for dev/staging, false for production."
  type        = bool
}