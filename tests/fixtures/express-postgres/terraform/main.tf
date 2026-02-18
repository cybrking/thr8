provider "aws" {
  region = "us-east-1"
}

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "public" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
  availability_zone = "us-east-1a"
  tags = { Name = "public" }
}

resource "aws_subnet" "private" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.2.0/24"
  availability_zone = "us-east-1a"
  tags = { Name = "private" }
}

resource "aws_security_group" "web" {
  name   = "web-sg"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    security_groups = [aws_security_group.db.id]
  }
}

resource "aws_security_group" "db" {
  name   = "db-sg"
  vpc_id = aws_vpc.main.id
}

resource "aws_ecs_cluster" "main" {
  name = "app-cluster"
}

resource "aws_ecs_service" "api" {
  name            = "api-service"
  cluster         = aws_ecs_cluster.main.id
  desired_count   = 3
  launch_type     = "FARGATE"
}

resource "aws_db_instance" "main" {
  engine               = "postgres"
  engine_version       = "15.2"
  instance_class       = "db.t3.medium"
  storage_encrypted    = true
  kms_key_id          = aws_kms_key.db.arn
  backup_retention_period = 7
  multi_az             = true
  publicly_accessible  = false
}

resource "aws_kms_key" "db" {
  description = "RDS encryption key"
}

resource "aws_s3_bucket" "assets" {
  bucket = "app-assets"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_secretsmanager_secret" "db_password" {
  name = "db-password"
}

resource "aws_cloudwatch_log_group" "api" {
  name = "/ecs/api"
}
