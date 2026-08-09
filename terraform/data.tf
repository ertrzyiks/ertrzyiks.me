data "onepassword_item" "woodtime_api_config_session_secret" {
  vault = "Dokku apps"
  title = "woodtime_api_config_session_secret"
}

data "onepassword_item" "yummy_release_github_token" {
  vault = "Dokku apps"
  title = "yummy_release_github_token"
}

data "onepassword_item" "yummy_release_hygraph_secret" {
  vault = "Dokku apps"
  title = "yummy_release_hygraph_secret"
}

data "onepassword_item" "yummy_release_sentry_dsn" {
  vault = "Dokku apps"
  title = "yummy_release_sentry_dsn"
}

data "onepassword_item" "yummy_release_statsig_secret_key" {
  vault = "Dokku apps"
  title = "yummy_release_statsig_secret_key"
}

data "onepassword_item" "yummy_next_statsig_server_key" {
  vault = "Dokku apps"
  title = "yummy_next_statsig_server_key"
}

data "onepassword_item" "yummy_next_algolia_search_key" {
  vault = "Dokku apps"
  title = "yummy_next_algolia_search_key"
}

data "onepassword_item" "personal_assistant_task_manager_redis_url" {
  vault = "Dokku apps"
  title = "personal_assistant_task_manager_redis_url"
}

data "onepassword_item" "personal_assistant_jobs_api_bearer_token" {
  vault = "Dokku apps"
  title = "personal_assistant_jobs_api_bearer_token"
}

data "onepassword_item" "personal_assistant_gcloud_oauth_client_id" {
  vault = "Dokku apps"
  title = "personal_assistant_gcloud_oauth_client_id"
}

data "onepassword_item" "personal_assistant_gcloud_oauth_client_secret" {
  vault = "Dokku apps"
  title = "personal_assistant_gcloud_oauth_client_secret"
}

data "onepassword_item" "personal_assistant_gcloud_oauth_refresh_token" {
  vault = "Dokku apps"
  title = "personal_assistant_gcloud_oauth_refresh_token"
}

# Basic Auth credentials for the two observability dashboards (#294/#313) — each a single
# 1Password Login item exposing both `.username` and `.password`, rather than two separate
# password-only items, since a username+password pair is what these actually are.
data "onepassword_item" "personal_assistant_task_manager_bull_board" {
  vault = "Dokku apps"
  title = "personal_assistant_task_manager_bull_board"
}

data "onepassword_item" "personal_assistant_dashboard_basic_auth" {
  vault = "Dokku apps"
  title = "personal_assistant_dashboard_basic_auth"
}

# Basic Auth credentials for kstatus's admin page — same shape as the two dashboard items above
# (a Login item exposing both `.username` and `.password`).
data "onepassword_item" "kstatus_admin_basic_auth" {
  vault = "Dokku apps"
  title = "kstatus_admin_basic_auth"
}

# `tasks` OAuth credential for task-manager's sync-google-tasks worker (see
# scripts/google-tasks-oauth) — separate from personal_assistant_gcloud_oauth_* above, which is
# the `gmail.readonly` credential used by personal-assistant and the Mac worker.
data "onepassword_item" "task_manager_google_tasks_oauth_client_id" {
  vault = "Dokku apps"
  title = "task_manager_google_tasks_oauth_client_id"
}

data "onepassword_item" "task_manager_google_tasks_oauth_client_secret" {
  vault = "Dokku apps"
  title = "task_manager_google_tasks_oauth_client_secret"
}

data "onepassword_item" "task_manager_google_tasks_oauth_refresh_token" {
  vault = "Dokku apps"
  title = "task_manager_google_tasks_oauth_refresh_token"
}

