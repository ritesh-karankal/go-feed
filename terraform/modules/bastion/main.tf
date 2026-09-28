data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

resource "aws_iam_role" "bastion" {
  name = "${var.project_name}-${var.environment}-bastion"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"

    Statement = [{
      Effect = "Allow"

      Principal = {
        Service = "ec2.amazonaws.com"
      }

      Action = "sts:AssumeRole"
    }]
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role = aws_iam_role.bastion.name

  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "bastion" {
  name = "${var.project_name}-${var.environment}-bastion"

  role = aws_iam_role.bastion.name
}

resource "aws_security_group" "bastion" {
  name        = "${var.project_name}-${var.environment}-bastion"
  description = "SSM-only administration host"
  vpc_id      = var.vpc_id

  egress {
    description = "HTTPS outbound"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-bastion"
  }
}

resource "aws_instance" "bastion" {
  ami = data.aws_ssm_parameter.al2023.value

  instance_type = var.instance_type

  subnet_id = var.public_subnet_id

  associate_public_ip_address = true

  iam_instance_profile = aws_iam_instance_profile.bastion.name

  vpc_security_group_ids = [
    aws_security_group.bastion.id
  ]

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"

    http_put_response_hop_limit = 1

    instance_metadata_tags = "disabled"
  }

  root_block_device {
    encrypted   = true
    volume_type = "gp3"
    volume_size = 20
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-bastion"
    Role        = "administration"
    Project     = var.project_name
    Environment = var.environment
  }
}