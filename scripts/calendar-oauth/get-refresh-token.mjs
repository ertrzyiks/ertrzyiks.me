import http from "node:http";
import { OAuth2Client } from "google-auth-library";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";

const clientId = process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "Missing credentials. Set GOOGLE_CALENDAR_OAUTH_CLIENT_ID and GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET " +
      "(from the Desktop app OAuth client you created in Google Cloud Console) and re-run.",
  );
  process.exit(1);
}

// Port 0 lets the OS assign a free loopback port. Desktop-app OAuth clients accept any
// http://localhost:<port>/... redirect URI without pre-registration — same reasoning as
// scripts/gmail-oauth/get-refresh-token.mjs, which this script otherwise mirrors closely (kept
// as a separate script/credential rather than folded into that one: the existing Gmail refresh
// token was only ever consented for gmail.readonly, and Google refresh tokens are scoped to
// whatever was granted at consent time — reusing it wouldn't carry calendar.events access).
const server = http.createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

const client = new OAuth2Client(clientId, clientSecret, redirectUri);

const authUrl = client.generateAuthUrl({
  access_type: "offline",
  scope: [SCOPE],
  // Forces the consent screen even if this Google account already granted this client access
  // before — without it, Google may skip issuing a new refresh_token on a repeat consent.
  prompt: "consent",
});

console.log("Open this URL in a browser and complete the consent flow:\n");
console.log(authUrl);
console.log("\nWaiting for the redirect back to this script...");

const { code } = await new Promise((resolve, reject) => {
  server.on("request", (req, res) => {
    const url = new URL(req.url, redirectUri);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404).end();
      return;
    }

    const error = url.searchParams.get("error");
    if (error) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end(`Consent denied or failed: ${error}. You can close this tab.`);
      reject(new Error(`OAuth consent error: ${error}`));
      return;
    }

    const code = url.searchParams.get("code");
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Consent captured. You can close this tab and return to the terminal.");
    resolve({ code });
  });
});

server.close();

const { tokens } = await client.getToken(code);

if (!tokens.refresh_token) {
  console.error(
    "\nNo refresh_token was returned. This Google account most likely already granted this " +
      "OAuth client consent before. Revoke prior access at " +
      "https://myaccount.google.com/permissions and re-run this script.",
  );
  process.exit(1);
}

console.log("\nSuccess. Store these values now — the refresh token is shown only once:\n");
console.log(`GOOGLE_CALENDAR_CLIENT_ID:     ${clientId}`);
console.log(`GOOGLE_CALENDAR_REFRESH_TOKEN: ${tokens.refresh_token}`);
console.log("\nSee README.md in this folder for where each value needs to go.");
