terraform {
  required_providers {
    dokku = {
      source  = "aliksend/dokku"
      version = "~> 1.0"
    }

    onepassword = {
      source  = "1Password/onepassword"
      version = "~> 1.4"
    }
  }

  backend "remote"  {
    organization = "ertrzyiks"
    workspaces {
      name = "prod"
    }
  }
}

provider "onepassword" {}

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

# Woodtime API app
resource "dokku_app" "woodtime_api" {
  app_name = "woodtime-api"

  config = {
    CONFIG_SESSION_SECRET =  data.onepassword_item.woodtime_api_config_session_secret.password
  }

  domains  = ["woodtime-api.ertrzyiks.me"]

  storage = {
    woodtime-api = {
      mount_path = "/app/apps/api/data"
    }
  }
}
