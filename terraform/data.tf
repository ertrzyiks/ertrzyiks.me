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

