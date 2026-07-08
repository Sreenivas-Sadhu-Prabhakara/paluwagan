# Security Policy

## Reporting a vulnerability

If you find a security issue in paluwagan, please report it privately rather than
opening a public issue.

- Email: **privacy@example.com** _(replace with a real contact before publishing)._
- Please include a description, steps to reproduce, and the potential impact.
- You will get an acknowledgement as soon as reasonably possible, and updates as
  the issue is investigated and fixed.

Please give us a reasonable chance to fix the issue before any public disclosure.
We will credit reporters who wish to be named.

## Scope and threat model

paluwagan is a static, client-side, offline-first application with **no backend**
and **no network access**:

- It stores data only in the browser's `localStorage`, on the user's device.
- Its Content-Security-Policy sets `connect-src 'none'`, so the app cannot make
  network requests — there is no data exfiltration path from the app itself, and
  no server to attack.
- There is no authentication, no account system, and no server-side data.

Because of this, the most relevant classes of issue are:

- **Cross-site scripting (XSS)** or DOM injection that could bypass the CSP or
  corrupt stored data. User-entered text is escaped before being inserted into the
  DOM; reports of any bypass are especially welcome.
- **CSP weaknesses** — anything that would allow an outbound connection or inline
  script execution contrary to the declared policy.
- **Local data-handling bugs** — e.g. import parsing that could crash or corrupt
  state (input is validated defensively and should degrade to an empty state
  rather than throw).

Out of scope: attacks that require the user's device or browser to already be
compromised, and log processing performed by the static host (see
[PRIVACY.md](PRIVACY.md)).

## Supported versions

The latest version on the default branch is the supported version.

See [`/.well-known/security.txt`](.well-known/security.txt) for machine-readable
contact details.
