export interface AdminBasicAuth {
  username: string;
  password: string;
}

export interface Config {
  databasePath: string;
  port: number;
  /**
   * `null` when either env var is unset — the Fastify app skips the Basic Auth guard on `/admin`
   * entirely in that case (dev), rather than treating a missing credential as a login failure.
   */
  adminBasicAuth: AdminBasicAuth | null;
}

// Matches the storage mount configured in terraform/main.tf's dokku_app.kstatus
// (`storage.kstatus.mount_path = "/app/data"`).
const DEFAULT_DATABASE_PATH = "/app/data/kstatus.sqlite";
const DEFAULT_PORT = 3000;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const username = env.KSTATUS_ADMIN_BASIC_AUTH_USERNAME;
  const password = env.KSTATUS_ADMIN_BASIC_AUTH_PASSWORD;

  // Both-or-neither: a lone credential is almost certainly a misconfiguration (typo'd env var
  // name, half-applied terraform change) rather than an intent to run unauthenticated, so it
  // fails loudly instead of silently opening the admin page.
  if (Boolean(username) !== Boolean(password)) {
    throw new Error(
      "KSTATUS_ADMIN_BASIC_AUTH_USERNAME and KSTATUS_ADMIN_BASIC_AUTH_PASSWORD must both be set, or both left unset",
    );
  }

  return {
    databasePath: env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH,
    port: Number(env.PORT ?? DEFAULT_PORT),
    adminBasicAuth: username && password ? { username, password } : null,
  };
}
