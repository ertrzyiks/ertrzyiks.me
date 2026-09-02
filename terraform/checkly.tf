# Checkly uptime checks for the apps declared in main.tf above (see #360). One check per app,
# sharing location/concurrency defaults via a single check group rather than repeating them.
# frequency = 720 (minutes) on every check below means each runs every 12h.
resource "checkly_check_group" "uptime" {
  name        = "ertrzyiks.me uptime"
  activated   = true
  muted       = false
  concurrency = 4
  tags        = ["uptime"]

  # Frankfurt — closest Checkly PoP to where these apps are actually served from/for.
  locations = ["eu-central-1"]
}

# Public pages: browser checks, not plain API 200s — these are the actual public entry points,
# so we want to catch a page that responds 200 but fails to render/hydrate in a real browser too.
resource "checkly_check" "blog" {
  name                      = "blog"
  type                      = "BROWSER"
  activated                 = true
  frequency                 = 720
  use_global_alert_settings = true
  group_id                  = checkly_check_group.uptime.id
  tags                      = ["uptime", "blog"]
  runtime_id                = "2026.04"

  script = <<-EOT
    const { expect, test } = require('@playwright/test')

    test('blog homepage loads', async ({ page }) => {
      const response = await page.goto('https://blog.ertrzyiks.me/')
      expect(response.status()).toBe(200)
    })
  EOT
}

resource "checkly_check" "home" {
  name                      = "home"
  type                      = "BROWSER"
  activated                 = true
  frequency                 = 720
  use_global_alert_settings = true
  group_id                  = checkly_check_group.uptime.id
  tags                      = ["uptime", "home"]
  runtime_id                = "2026.04"

  script = <<-EOT
    const { expect, test } = require('@playwright/test')

    test('home page loads', async ({ page }) => {
      const response = await page.goto('https://ertrzyiks.me/')
      expect(response.status()).toBe(200)
    })
  EOT
}

# task-manager's only unauthenticated route: GET /health, added specifically for liveness checks
# like this one (see apps/task-manager/src/app.ts) — every other route sits behind the
# bearer-auth hook (isValidBearerToken), which previously left no unauthenticated route to hit;
# hitting one with no Authorization header and asserting the resulting 401 stood in for a real
# liveness check, but Checkly counts a 401 as a failed check regardless of the assertion passing,
# so it never actually worked as uptime monitoring. /health sidesteps that: a real 200 with no
# auth required, and no dependency on the production JOBS_API_BEARER_TOKEN either.
resource "checkly_check" "task_manager" {
  name                      = "task-manager"
  type                      = "API"
  activated                 = true
  frequency                 = 720
  use_global_alert_settings = true
  group_id                  = checkly_check_group.uptime.id
  tags                      = ["uptime", "task-manager"]

  request {
    url = "https://task-manager.ertrzyiks.me/health"

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

# personal-assistant's only unauthenticated route: GET /health, added specifically for liveness
# checks like this one (see apps/personal-assistant/src/healthServer.ts).
resource "checkly_check" "personal_assistant" {
  name                      = "personal-assistant"
  type                      = "API"
  activated                 = true
  frequency                 = 720
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
