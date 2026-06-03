// Email allowlist enforcement.
//
// A Google OAuth *client ID* does not restrict which Google accounts can sign
// in — any Google user can obtain a valid ID token for it. The consent-screen
// "test users" list only gates the consent prompt, not real authorization.
// So we gate access here, in our own backend.
//
// Configure via the ALLOWED_EMAILS env var: a comma-separated list of allowed
// email addresses and/or domains. Domain entries start with "@", e.g.:
//   ALLOWED_EMAILS=alice@gmail.com, bob@example.com, @mycompany.com
// Matching is case-insensitive. If ALLOWED_EMAILS is unset/empty, login is
// blocked for everyone (fail closed).

function parseAllowlist(): string[] {
  return (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string): boolean {
  const allowlist = parseAllowlist();
  if (allowlist.length === 0) {
    console.warn(
      '[auth] ALLOWED_EMAILS is not set — rejecting all logins. ' +
        'Set ALLOWED_EMAILS to a comma-separated list of emails/domains to grant access.'
    );
    return false;
  }

  const normalized = email.trim().toLowerCase();
  const domain = normalized.slice(normalized.lastIndexOf('@')); // includes leading "@"

  return allowlist.some((entry) =>
    entry.startsWith('@') ? entry === domain : entry === normalized
  );
}
