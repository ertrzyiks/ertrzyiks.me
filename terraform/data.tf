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

# Personal API token for task-manager's sync-todoist worker — unlike the Google Tasks integration
# this replaced, Todoist needs no OAuth client/refresh-token pair, just a token generated once from
# Settings > Integrations > Developer in the Todoist app.
data "onepassword_item" "task_manager_todoist_api_token" {
  vault = "Dokku apps"
  title = "task_manager_todoist_api_token"
}

# WBPG library card login for the library-loan -> Google Calendar sync workers (started inside
# apps/task-manager/src/server.ts, same as the Todoist worker above) — a Login item exposing
# both `.username` and `.password`, since that's literally what this credential is.
data "onepassword_item" "task_manager_wbpg_login" {
  vault = "Dokku apps"
  title = "task_manager_wbpg_login"
}

# calendar.events refresh token for that same worker (see scripts/calendar-oauth/README.md) —
# again its own refresh token, minted from the same shared OAuth client below (#343).
data "onepassword_item" "task_manager_google_calendar_refresh_token" {
  vault = "Dokku apps"
  title = "task_manager_google_calendar_refresh_token"
}

# Axiom ingest credentials for historical/trend event observability (#315) — one Login item per
# service (per its resolution: separate datasets, least-privilege scoped tokens per service),
# `.username` repurposed to hold the dataset name and `.password` the API token, same "two
# related values in one Login item" pattern as personal_assistant_task_manager_bull_board above.
data "onepassword_item" "task_manager_axiom" {
  vault = "Dokku apps"
  title = "task_manager_axiom"
}

data "onepassword_item" "personal_assistant_axiom" {
  vault = "Dokku apps"
  title = "personal_assistant_axiom"
}

# Sentry DSNs for error monitoring — one Password item per service (separate Sentry projects,
# same by-service split Axiom uses above), same shape as yummy_release_sentry_dsn (a single
# secret value, `.password` only, no `.username` needed).
data "onepassword_item" "task_manager_sentry_dsn" {
  vault = "Dokku apps"
  title = "task_manager_sentry_dsn"
}

data "onepassword_item" "personal_assistant_sentry_dsn" {
  vault = "Dokku apps"
  title = "personal_assistant_sentry_dsn"
}

# Shared Google Cloud OAuth client id/secret (#343), used for all three Google API scopes this
# repo integrates with — gmail.readonly (personal_assistant + the Mac worker), tasks, and
# calendar.events. A Google OAuth client isn't scope-bound, only the refresh tokens minted from
# it are (each flow keeps its own, see the *_refresh_token items above), so one client/secret
# pair covers all three rather than three duplicated copies of the same value. A Login item
# exposing both `.username` (client id) and `.password` (client secret), same shape as the Basic
# Auth items above.
data "onepassword_item" "personal_assistant_google_oauth_client" {
  vault = "Dokku apps"
  title = "personal_assistant_google_oauth_client"
}

