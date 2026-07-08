# Contributing to paluwagan

Thank you for your interest in improving paluwagan. This is a small, deliberately
simple project, and contributions that keep it that way are very welcome.

## Guiding principles

Please keep these in mind — they are the whole point of the project:

- **No dependencies.** No runtime npm packages, no build step, no bundler, no CDN,
  no web fonts. Just HTML, CSS, and vanilla ES modules. Tests use only Node's
  built-in `node:test` runner.
- **No network.** The app must never make a network request. The
  `connect-src 'none'` Content-Security-Policy is a hard guarantee — do not add
  code or a CSP change that would allow outbound connections.
- **Logic stays pure and testable.** Domain logic lives in `src/model.js`,
  `src/settlement.js`, and `src/store.js` as DOM-free modules. Any date-dependent
  function must take the date as a parameter — never call `Date.now()` or read the
  clock inside pure logic. DOM code lives only in `src/app.js`.
- **Accessibility and responsiveness are requirements, not extras.** Labels,
  keyboard operation, focus states, `aria-live` status, light/dark support, and a
  layout that works on a phone.

## Running it locally

Because the app uses ES modules, serve it over HTTP rather than opening the file
directly:

```bash
python3 -m http.server 4173
# then open http://localhost:4173/
```

## Running the tests

```bash
npm test    # runs: node --test "test/**/*.test.js"
```

Requires Node 18+. There is nothing to install — the test runner is built in.
Please add or update tests for any change to the logic in `src/`.

## Making a change

1. Fork the repository and create a branch for your change.
2. Make your change, keeping the principles above.
3. Add tests and run `npm test` — everything must pass.
4. Check that the app still works in a browser, including on a narrow (phone-width)
   viewport and with the keyboard.
5. Open a pull request describing what you changed and why. The
   [pull request template](.github/PULL_REQUEST_TEMPLATE.md) will guide you.

## Reporting bugs and requesting features

Use the GitHub issue templates for [bug reports](.github/ISSUE_TEMPLATE/bug_report.md)
and [feature requests](.github/ISSUE_TEMPLATE/feature_request.md).

## Code of conduct

By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please report security issues privately as described in [SECURITY.md](SECURITY.md),
not in a public issue.
