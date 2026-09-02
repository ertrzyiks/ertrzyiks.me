# Checkly uptime checks for the apps declared in main.tf above (see #360). One check per app,
# sharing location/concurrency defaults via a single check group rather than repeating them.
resource "checkly_check_group" "uptime" {
  name        = "ertrzyiks.me uptime"
  activated   = true
  muted       = false
  concurrency = 4
  tags        = ["uptime"]

  # Frankfurt — closest Checkly PoP to where these apps are actually served from/for.
  locations = ["eu-central-1"]
}

# Public pages: a plain 200 on `/` is enough to prove the app is served.
resource "checkly_check" "blog" {
  name                      = "blog"
  type                      = "API"
  activated                 = true
  frequency                 = 10
  use_global_alert_settings = true
  group_id                  = checkly_check_group.uptime.id
  tags                      = ["uptime", "blog"]

  request {
    url = "https://blog.ertrzyiks.me/"

    assertion {
      source     = "STATUS_CODE"
      comparison = "EQUALS"
      target     = "200"
    }
  }
}

resource "checkly_check" "home" {
  name                      = "home"
  type                      = "API"
  activated                 = true
  frequency                 = 10
  use_global_alert_settings = true
  group_id                  = checkly_check_group.uptime.id
  tags                      = ["uptime", "home"]

  request {
    url = "https://ertrzyiks.me/"

    assertion {
      source     = "STATUS_CODE"
      comparison = "EQUALS"
      target     = "200"
    }
  }
}

# task-manager has no unauthenticated route — every /jobs* route sits behind the bearer-auth
# hook in isValidBearerToken (apps/task-manager/src/app.ts), which returns 401 before looking
# anything up. Hitting one with no Authorization header still proves the Fastify process is up
# and routing correctly: 401 means "alive, auth working as designed"; a timeout/502/other code
# means it's actually down. Deliberately not spending the production JOBS_API_BEARER_TOKEN here
# so this check doesn't depend on that secret too.
resource "checkly_check" "task_manager" {
  name                      = "task-manager"
  type                      = "API"
  activated                 = true
  frequency                 = 10
  use_global_alert_settings = true
  group_id                  = checkly_check_group.uptime.id
  tags                      = ["uptime", "task-manager"]

  request {
    url    = "https://task-manager.ertrzyiks.me/jobs/checkly-uptime-probe"
    method = "GET"

    assertion {
      source     = "STATUS_CODE"
      comparison = "EQUALS"
      target     = "401"
    }
  }
}

# personal-assistant's only unauthenticated route: GET /health, added specifically for liveness
# checks like this one (see apps/personal-assistant/src/healthServer.ts).
resource "checkly_check" "personal_assistant" {
  name                      = "personal-assistant"
  type                      = "API"
  activated                 = true
  frequency                 = 10
  use_global_alert_settings = true
  group_id                  = checkly_check_group.uptime.id
  tags                      = ["uptime", "personal-assistant"]

  request {
    url = "https://personal-assistant.ertrzyiks.me/health"

    assertion {
      source     = "STATUS_CODE"
      comparison = "EQUALS"
      target     = "200"
    }

    assertion {
      source     = "JSON_BODY"
      property   = "$.status"
      comparison = "EQUALS"
      target     = "ok"
    }
  }
}
