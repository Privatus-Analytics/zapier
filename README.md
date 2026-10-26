# Privatus Analytics for Zapier

**Put your website stats and alerts to work in your Zaps.**

You want your website numbers to reach the tools your team uses, like a message
when your site goes down or a row in a sheet for each new testimonial. Doing it
by hand takes time every day.

This Zapier app connects Privatus Analytics to your other apps. Start a Zap when
an alert fires, a site goes down or a testimonial comes in. Read stats, create
goals and campaign links, and more.

So reports and alerts go where your team already works, with no copy and paste.
The numbers are honest too. Privatus Analytics counts visits without cookies, so
there is no cookie pop-up for your analytics, and it leaves bots out.

**Free plan, no card:** 10,000 events a month (an event is a page view or an action you track) on up to 3 sites. [Start free at privatusanalytics.com](https://privatusanalytics.com).

## About this repo

A [Zapier Platform CLI](https://github.com/zapier/zapier-platform) app for
[Privatus Analytics](https://privatusanalytics.com), built only on the public
API (`/openapi.json`) and the signed webhooks (`/docs/api/webhooks`). No
server change is needed.

## What it does

**Instant triggers (REST hooks), one per webhook event (25):** alert
triggered or resolved, goal alert, usage threshold, uptime down or recovered,
new site, site deleted, new member, export ready, analytics import completed
or failed, site audit completed, experiment ended, new testimonial,
testimonial approved, rejected, restored, moved to trash or deleted,
testimonial form submitted, testimonial request sent or finished, testimonial
import finished, new reviews found by sync. Most have an optional Site filter.
Alerts can also filter by rule, forms by form, requests by request, and
testimonials and form submissions by minimum rating.

**Polling triggers:** New Goal, New Chart Note.

**Actions (21):** Create Site, Create Goal, Create Chart Note, Create Workspace
Chart Note, Create Campaign Link, Add Campaign Cost, Create Uptime Check,
Pause or Resume Uptime Check, Acknowledge Alert, Mute Alert, Post Status Page
Update, Create Export, Invite Member, Run Site Audit, Start, Pause or End
Experiment, Create Testimonial, Update Testimonial, Approve, Reject or Pin
Testimonial, Create Testimonial Person, Ask for a Testimonial (add a request
recipient), API Request (Advanced).

**Searches (14):** Find Site, Get Site Stats, Get Top Pages, Sources or
Countries, Get Daily Stats, Get Live Visitors, Find Goal, Find Uptime Check,
Find Alert Rule, Get Latest Site Audit, Find Experiment, Find Member, Find
Testimonial, Get Testimonial by ID, Find Testimonial Person. Find or Create
pairs exist for sites, goals and testimonial people.

## How it is put together

- `lib/operations.js` lists the API operations the app calls.
  `npm run sync-spec` trims `/openapi.json` to them in `lib/spec.json`.
  Field labels, help text, choices and output fields come from that file
  (`lib/fields.js`), and `lib/api.js#run` builds every request from it:
  path parameters, the query string (lists as `status[]=a`, filters as JSON)
  or the JSON body, typed as documented. Re-run the sync after an API change.
- **Auth:** an API token (`pat_…`), sent as `Authorization: Bearer`. A token
  belongs to one workspace, and `GET /workspaces.json` lists only that one,
  so no Zap asks for a workspace. The connection label is the workspace name.
  A 401 marks the connection expired, a 402 says a higher plan is needed and
  a 429 is retried by Zapier.
- **REST hooks** (`triggers/hook.js`): turning a Zap on calls
  `POST /workspaces/{id}/webhooks.json` with one event and keeps the signing
  secret, turning it off deletes the webhook (404 counts as gone). Every
  delivery must have a valid `Privatus-Signature` at most five minutes old,
  or it fires nothing (A08-104). A Zap gets `data` plus the delivery `id`,
  `event`, `occurred_at` and `workspace_id`. The sample step uses recent real
  records where an endpoint gives them, otherwise `samples/webhooks.json`.
  Triggers need a token with workspace settings permission and every site.
- `samples/records.json` holds real responses captured from a development
  server, with names and hosts replaced.
- `PRIVATUS_BASE_URL` (env) points a test version at another server, for
  example `http://localhost:3008`. Connections never choose a host.

Not covered on purpose: deleting anything (sites, testimonials, goals), and
connecting testimonial email providers, which is browser only.

## Development

```sh
npm install
npm test                                   # jest + nock, no network
npm run sync-spec                          # refresh lib/spec.json from production
npx zapier-platform-cli@19.1.0 validate
```

The Zapier CLI is not in this package's lockfile, so every command names
the exact release (the same version as `zapier-platform-core`). Without the
version, `npx` would run whatever is newest that day, with your deploy key
in reach.

## Deploy

```sh
npx zapier-platform-cli@19.1.0 login
npx zapier-platform-cli@19.1.0 register "Privatus Analytics"
npx zapier-platform-cli@19.1.0 push
```

`register` writes `.zapierapprc` (ignored by git). After the first push,
test every trigger in a private Zap, then promote the version.
