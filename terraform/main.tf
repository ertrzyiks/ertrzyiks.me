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

# Task Manager app (Jobs API server, see #248). Also runs the sync-google-tasks and library-loan
# -> Google Calendar sync workers, both as extra bullmq.Worker instances started directly inside
# server.ts (see that file) rather than as separate Dokku process types — a single `web` process
# covers everything, no `dokku ps:scale` step needed.
resource "dokku_app" "task_manager" {
  app_name = "task-manager"

  config = {
    REDIS_URL             = data.onepassword_item.personal_assistant_task_manager_redis_url.password
    JOBS_API_BEARER_TOKEN = data.onepassword_item.personal_assistant_jobs_api_bearer_token.password
    # Optional: Bull Board's Basic Auth guard only activates once both are set (#296/#311) —
    # provisioned here so it's always active in production.
    TASK_MANAGER_BULL_BOARD_BASIC_AUTH_USERNAME = data.onepassword_item.personal_assistant_task_manager_bull_board.username
    TASK_MANAGER_BULL_BOARD_BASIC_AUTH_PASSWORD = data.onepassword_item.personal_assistant_task_manager_bull_board.password
    # Optional: the sync-google-tasks worker only starts once all three are set (server.ts) — see
    # scripts/google-tasks-oauth for how to provision the 1Password items these read from.
    GOOGLE_TASKS_CLIENT_ID     = data.onepassword_item.task_manager_google_tasks_oauth_client_id.password
    GOOGLE_TASKS_CLIENT_SECRET = data.onepassword_item.task_manager_google_tasks_oauth_client_secret.password
    GOOGLE_TASKS_REFRESH_TOKEN = data.onepassword_item.task_manager_google_tasks_oauth_refresh_token.password

    # Optional: the library sync workers only start once all five (six with the id below) are
    # set (server.ts) — see scripts/calendar-oauth for how to provision the Calendar OAuth ones.
    WBPG_USERNAME                 = data.onepassword_item.task_manager_wbpg_login.username
    WBPG_PASSWORD                 = data.onepassword_item.task_manager_wbpg_login.password
    GOOGLE_CALENDAR_CLIENT_ID     = data.onepassword_item.task_manager_google_calendar_client_id.password
    GOOGLE_CALENDAR_CLIENT_SECRET = data.onepassword_item.task_manager_google_calendar_client_secret.password
    GOOGLE_CALENDAR_REFRESH_TOKEN = data.onepassword_item.task_manager_google_calendar_refresh_token.password
    # Not a secret (a Calendar ID doesn't grant access on its own — the refresh token above is
    # what does), so it's a plain literal here rather than a 1Password item. The "Dom" calendar,
    # not the refresh token account's primary one — see googleCalendar.ts's GOOGLE_CALENDAR_ID.
    GOOGLE_CALENDAR_ID = "beff7d227de04ef6e92cec0deea77b7ef9e1a89346af7d76b047d90fff377d1c@group.calendar.google.com"

    # Optional: trend-event emission to Axiom (#315) — a no-op in both jobProcessor.ts and
    # googleTasksJobProcessor.ts until both are set. Separate dataset/token from
    # personal_assistant's own below, per #315's resolution (one dataset per service).
    AXIOM_TOKEN   = data.onepassword_item.task_manager_axiom.password
    AXIOM_DATASET = data.onepassword_item.task_manager_axiom.username
  }

  domains = ["task-manager.ertrzyiks.me"]

  # `DATABASE_PATH` defaults to /app/data/library.sqlite (see libraryConfig.ts) — this is where
  # the library-loan sync worker's loans snapshot lives across redeploys.
  storage = {
    task-manager = {
      mount_path = "/app/data"
    }
  }
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
    # Required: the snapshot dashboard (#297/#312) won't start without both set.
    PERSONAL_ASSISTANT_DASHBOARD_BASIC_AUTH_USERNAME = data.onepassword_item.personal_assistant_dashboard_basic_auth.username
    PERSONAL_ASSISTANT_DASHBOARD_BASIC_AUTH_PASSWORD = data.onepassword_item.personal_assistant_dashboard_basic_auth.password

    # Optional: trend-event emission to Axiom (#315) — a no-op in poller.ts until both are set.
    # Separate dataset/token from task_manager's own above, per #315's resolution (one dataset
    # per service).
    AXIOM_TOKEN   = data.onepassword_item.personal_assistant_axiom.password
    AXIOM_DATASET = data.onepassword_item.personal_assistant_axiom.username
  }

  domains = ["personal-assistant.ertrzyiks.me"]

  storage = {
    personal-assistant = {
      mount_path = "/app/data"
    }
  }
}

# kstatus app (manually managed status page)
resource "dokku_app" "kstatus" {
  app_name = "kstatus"

  config = {
    # Required: the admin Basic Auth guard only activates once both are set — see
    # apps/kstatus/src/config.ts. Left unset (as in local dev) it's wide open, so this must always
    # be provisioned in production.
    KSTATUS_ADMIN_BASIC_AUTH_USERNAME = data.onepassword_item.kstatus_admin_basic_auth.username
    KSTATUS_ADMIN_BASIC_AUTH_PASSWORD = data.onepassword_item.kstatus_admin_basic_auth.password
  }

  domains = ["kstatus.ertrzyiks.me"]

  storage = {
    kstatus = {
      mount_path = "/app/data"
    }
  }
}

