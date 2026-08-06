terraform {
  required_providers {
    dokku = {
      source  = "aliksend/dokku"
      version = "1.0.24"
    }

    onepassword = {
      source  = "1Password/onepassword"
      version = "3.3.1"
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

resource "dokku_app" "yummy_release" {
  app_name = "yummy-release"

  config = {
    APP_ENVIRONMENT = "production"
    NODE_MODULES_CACHE = true
    GITHUB_TOKEN = data.onepassword_item.yummy_release_github_token.password
    HYGRAPH_SECRET = data.onepassword_item.yummy_release_hygraph_secret.password
    SENTRY_DSN = data.onepassword_item.yummy_release_sentry_dsn.password
    STATSIG_SECRET_KEY = data.onepassword_item.yummy_release_statsig_secret_key.password
  }

  domains = ["yummy-release.ertrzyiks.me"]
}

resource "dokku_app" "yummy_next" {
  app_name = "yummy-next"

  config = {
    NEXT_PUBLIC_STATSIG_CLIENT_KEY = "client-EfXZkJjxGG8j8o2QhZP3aJosLszWNeMR1ouYy9aberF"
    STATSIG_SERVER_KEY = data.onepassword_item.yummy_next_statsig_server_key.password
    ALGOLIA_SEARCH_KEY = data.onepassword_item.yummy_next_algolia_search_key.password
  }

  domains = ["kuchnia-yummy.pl"]
}

# Task Manager app (Jobs API server, see #248)
resource "dokku_app" "task_manager" {
  app_name = "task-manager"

  config = {
    REDIS_URL             = data.onepassword_item.personal_assistant_task_manager_redis_url.password
    JOBS_API_BEARER_TOKEN = data.onepassword_item.personal_assistant_jobs_api_bearer_token.password
  }

  domains = ["task-manager.ertrzyiks.me"]
}

# Personal Assistant app (email orchestration service, see #250)
resource "dokku_app" "personal_assistant" {
  app_name = "personal-assistant"

  config = {
    GMAIL_CLIENT_ID       = data.onepassword_item.personal_assistant_gcloud_oauth_client_id.password
    GMAIL_CLIENT_SECRET   = data.onepassword_item.personal_assistant_gcloud_oauth_client_secret.password
    GMAIL_REFRESH_TOKEN   = data.onepassword_item.personal_assistant_gcloud_oauth_refresh_token.password
    JOBS_API_BEARER_TOKEN = data.onepassword_item.personal_assistant_jobs_api_bearer_token.password
    JOBS_API_BASE_URL     = "https://task-manager.ertrzyiks.me"
  }

  domains = ["personal-assistant.ertrzyiks.me"]

  storage = {
    personal-assistant = {
      mount_path = "/app/data"
    }
  }
}

