# Privacy Policy

_Last updated: 2026_

paluwagan is designed so that your savings-group records stay with you. This
policy describes, honestly, what happens to your data.

## The short version

- The app **collects nothing** and **transmits nothing**.
- Everything you enter — group names, member names, amounts, and paid marks —
  stays in your browser's local storage, on your device.
- You can **export**, **import**, and **permanently delete** all of it yourself,
  at any time.

## What data the app handles

To do its job, paluwagan stores the information you type in:

- group settings (name, contribution amount, currency, frequency, start date),
- member names,
- the payout rotation order,
- which contributions have been marked paid, and the date each was marked.

This is stored as a single JSON entry in your browser's `localStorage`, under the
key `paluwagan.v1.state`. It never leaves the device unless **you** export it to a
file and move that file yourself.

## What the app does *not* do

- No account, sign-in, or profile.
- No analytics, telemetry, tracking pixels, cookies for tracking, fingerprinting,
  or advertising.
- No third-party scripts, no CDN, no web fonts, no external requests of any kind.

This is enforced technically, not just promised. The page sets a
Content-Security-Policy that includes `connect-src 'none'`, which instructs the
browser to block **all** outbound network connections (fetch, XMLHttpRequest,
WebSocket, `sendBeacon`). If any code — including a future bug or a malicious
contribution — tried to send your data somewhere, the browser would refuse. This
is the headline privacy control: the app *cannot* transmit your data.

## Your controls

- **Export** downloads a JSON copy of everything, so you can back it up or move it
  to another device.
- **Import** loads such a file back in.
- **Delete everything** clears the stored data from this browser. This is
  irreversible; export first if you want a backup.

Because the app is local-only, these controls are the complete mechanism for data
portability and erasure — there is no server-side copy to request or delete.

## Hosting and server logs (be aware)

The app itself sends nothing. However, when you **load** the page from a host such
as **GitHub Pages**, that host — like any web server — automatically processes
standard access logs, which can include your **IP address**, user-agent, and the
time of the request, as part of delivering the page and protecting the service.

- This is ordinary web-server behavior, not something paluwagan initiates or can
  turn off, and it is governed by the **host's** privacy policy (for GitHub Pages,
  GitHub's privacy statement), not by this project.
- The project maintainers **do not receive or have access to** those logs.
- To avoid host logs entirely, download the files and open the app from your own
  device or an offline copy.

## Fair processing of other people's data

A paluwagan is about other people. When you enter members' names, you are
recording personal information about them. Please make sure the people in your
group are aware of and agree to being recorded here. Keep the exported file
secure, share it only with people who should see it, and delete it when the group
finishes if that is what your members expect.

## Changes

Because the app stores nothing centrally, changes to this policy apply to future
use of the app. The current version is always the one in the repository.

## Contact

Privacy questions: **privacy@example.com** _(replace with a real contact before
publishing)._
