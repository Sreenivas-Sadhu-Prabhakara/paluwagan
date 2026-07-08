# Compliance Notes

This document describes, honestly and in plain terms, how paluwagan's design maps
to several data-protection frameworks. **It is a technical design description, not
legal advice, and not a certification or a claim of formal compliance.** If you
deploy or rely on this software in a regulated context, get your own legal review.

The recurring theme is simple: paluwagan is a **local-only, no-backend** app that
**collects and transmits nothing**. Most obligations that fall on an online service
do not arise here because there is no server, no account, and no data controller
operating infrastructure on your behalf. The person who records their group is,
in practice, the one who decides what is stored on their own device.

## GDPR (EU 2016/679)

| Principle / right | How paluwagan addresses it |
| --- | --- |
| **Art. 5(1)(c) — Data minimisation** | The app stores only the fields needed to run a savings circle: group settings, member names, rotation order, and paid marks. No identifiers, contact details, analytics, or tracking data are collected. |
| **Art. 25 — Data protection by design and by default** | Local-only storage and a Content-Security-Policy with `connect-src 'none'` mean the default (and only) behavior is that no data leaves the device. Privacy is the built-in default, not an option to switch on. |
| **Arts. 15–20 — Access, rectification, erasure, portability** | All data is on the user's device and fully visible in the app. **Export** provides portability (a structured JSON file), the editor provides rectification, and **Delete everything** provides erasure. There is no server-side copy to reconcile. |
| **Art. 32 — Security of processing** | There is no transmission to secure and no central store to breach. Data rests in the browser's storage, under the browser's and operating system's protections; the CSP blocks exfiltration. |
| **Roles** | With no operator-run backend, there is no service-side "controller" or "processor" of your group data. The individual maintaining the record acts as the controller of the data on their own device; the maintainers of this open-source project do not process it. |

Note on hosting: the web host that serves the page (e.g. GitHub Pages) processes
standard access logs (such as IP addresses) under **its own** policy; see
[PRIVACY.md](PRIVACY.md). That processing is the host's, not this project's.

## India — Digital Personal Data Protection Act, 2023 (DPDPA)

| Expectation | How paluwagan addresses it |
| --- | --- |
| **Data minimisation & purpose limitation** | Only data necessary for the stated purpose (tracking a savings group) is stored, and it is used for nothing else — there is no secondary processing, profiling, or sharing. |
| **No maintainer processing** | The project maintainers operate no backend and never receive user data, so there is no fiduciary handling of personal data on the service side. |
| **Data-principal rights (access, correction, erasure)** | Honored locally: all data is viewable and editable in-app, exportable, and permanently deletable by the user. |
| **Grievance redressal / Data Protection Officer** | As a local-only tool there is no operator acting as a Data Fiduciary. For questions about the software and this design, a **privacy contact** (see below) stands in for the grievance-officer/DPO point of contact that a data-processing service would be expected to publish. |
| **Controller in practice** | The individual who records their group is effectively the person who determines the purpose and means of processing their own local data, and is responsible for the members' data they enter. |

## HIPAA (US, 45 CFR Parts 160/164)

**Not applicable.** paluwagan is a savings-group ledger and is **not** designed for
and should not be used to store Protected Health Information (PHI):

- It handles **no health information** — no diagnoses, treatment, or medical data.
- There is **no covered entity or business associate** relationship — the project
  operates no service and signs no Business Associate Agreement.
- There is **no server** transmitting or storing PHI.

For completeness, the general security posture is nonetheless conservative: data
stays on-device and the CSP blocks all outbound connections. But HIPAA's
obligations do not attach to this software, and it must not be repurposed to
handle PHI.

## Disclaimer

This is a good-faith technical mapping to help evaluators understand the design.
It is **not legal advice, not a warranty, and not a certification of compliance**
with any law or standard. Consult qualified counsel for your specific situation.

## Privacy contact

**privacy@example.com** _(replace with a real contact before publishing)._
