terraform {
  required_providers {
    dokku = {
      source  = "aliksend/dokku"
      version = "~> 1.0"
    }
  }

  backend "remote"  {
    organization = "ertrzyiks"
    workspaces {
      name = "prod"
    }
  }
}

provider "dokku" {
  ssh_host = var.dokku_ssh_host
  ssh_user = var.dokku_ssh_user
  ssh_port = var.dokku_ssh_port
  ssh_cert = var.dokku_ssh_cert
}

# NOTE: Terraform only manages resources defined in this configuration.
# Existing Dokku apps not defined here will NOT be affected or destroyed.
# Terraform will only create, update, or destroy the apps explicitly declared below.

# Blog app
resource "dokku_app" "blog" {
  app_name = "blog"

  domains = ["blog.ertrzyiks.me"]
}

# Home app
resource "dokku_app" "home" {
  app_name = "home"

  domains = ["ertrzyiks.me"]
}
