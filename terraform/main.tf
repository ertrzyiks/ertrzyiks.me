terraform {
  required_providers {
    dokku = {
      source  = "aliksend/dokku"
      version = "~> 1.0"
    }
  }
}

provider "dokku" {
  ssh_host = var.dokku_ssh_host
  ssh_user = var.dokku_ssh_user
  ssh_port = var.dokku_ssh_port
  ssh_cert = var.dokku_ssh_cert
}

# Blog app
resource "dokku_app" "blog" {
  app_name = "blog"
}

# Home app
resource "dokku_app" "home" {
  app_name = "home"
}
