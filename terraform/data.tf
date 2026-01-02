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

