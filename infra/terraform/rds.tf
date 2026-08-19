resource "aws_db_subnet_group" "recontent" {
  name        = var.rds_db_subnet_group_name
  description = "Created from the RDS Management Console"
  subnet_ids  = var.ecs_service_subnet_ids

  tags = local.common_tags
}

resource "aws_vpc_security_group_ingress_rule" "rds_mysql_from_ecs" {
  security_group_id            = var.default_vpc_security_group_id
  referenced_security_group_id = var.ecs_service_security_group_ids[0]
  ip_protocol                  = "tcp"
  from_port                    = 3306
  to_port                      = 3306
  description                  = "Allow ECS recontent service to connect to Aurora"
}

resource "aws_vpc_security_group_ingress_rule" "rds_mysql_from_test_ec2" {
  security_group_id            = var.default_vpc_security_group_id
  referenced_security_group_id = var.mysql_test_ec2_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 3306
  to_port                      = 3306
  description                  = "Allow mysql-test EC2 to connect to RDS"
}

resource "aws_vpc_security_group_ingress_rule" "rds_mysql_from_temp_cidr" {
  security_group_id = var.default_vpc_security_group_id
  cidr_ipv4         = var.temporary_mysql_admin_cidr
  ip_protocol       = "tcp"
  from_port         = 3306
  to_port           = 3306
  description       = "temperary_schema_create"
}

resource "aws_db_instance" "recontent" {
  identifier                          = var.rds_instance_identifier
  instance_class                      = "db.t4g.micro"
  allocated_storage                   = 20
  max_allocated_storage               = 1000
  engine                              = "mysql"
  engine_version                      = "8.4.9"
  username                            = var.rds_master_username
  manage_master_user_password         = true
  master_user_secret_kms_key_id       = var.rds_master_user_secret_kms_key_id
  db_subnet_group_name                = aws_db_subnet_group.recontent.name
  vpc_security_group_ids              = [var.default_vpc_security_group_id, var.alb_security_group_id]
  publicly_accessible                 = true
  storage_type                        = "gp2"
  storage_encrypted                   = true
  kms_key_id                          = var.rds_storage_kms_key_id
  port                                = 3306
  backup_retention_period             = 1
  backup_window                       = "03:54-04:24"
  maintenance_window                  = "sun:10:08-sun:10:38"
  copy_tags_to_snapshot               = true
  monitoring_interval                 = 60
  monitoring_role_arn                 = var.rds_monitoring_role_arn
  auto_minor_version_upgrade          = true
  deletion_protection                 = false
  performance_insights_enabled        = false
  iam_database_authentication_enabled = false
  multi_az                            = false
  network_type                        = "IPV4"
  ca_cert_identifier                  = "rds-ca-rsa2048-g1"
  parameter_group_name                = "default.mysql8.4"
  option_group_name                   = "default:mysql-8-4"

  tags = local.common_tags
}
