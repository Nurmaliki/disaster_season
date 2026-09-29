# Indonesia Disaster & Season Monitor

A map-first dashboard for monitoring weather, seasons, early warnings, disasters,
volcanoes, earthquakes, tsunami potential, floods, landslides, wildfires and
drought across Indonesia — built **only from official Indonesian data sources**.

> **This app does not predict earthquakes.** It shows earthquakes that have
> already occurred ("gempa terbaru", "riwayat gempa"). No endpoint or UI string
> implies prediction.

> **The Risk Score is not an official warning.** It is an internal indicator
> computed from the data available to the app. Always follow official
> information from BMKG, BNPB, BPBD, and PVMBG.

## What it does

- **Map-first dashboard** (MapLibre GL JS) with clustering, layer toggles,
  severity legend, popups, geolocation (opt-in), and URL-synced view state.
- **Real early warnings** — BMKG CAP alerts (RSS index + per-alert detail XML),
  with ended warnings dropped.
- **Real earthquakes** — BMKG `autogempa`, `gempaterkini`, `gempadirasakan`.
- **Real volcano activity levels** — PVMBG / MAGMA, with a bundled coordinate
  reference table (volcanoes without published coordinates are never plotted).
- **Weather forecasts** — BMKG public forecast API (village-level `adm4`).
- **Seasonal context** — the national monsoon phase, clearly labelled as coarse
  context rather than a regional seasonal forecast.
- **Statistics** — counts derived only from events actually fetched.
- **Provider health** — `/status` shows each source's _earned_ state, never an
  optimistic guess.

## Stack

SvelteKit (latest) · TypeScript · Tailwind CSS v4 · Lucide icons · MapLibre GL JS
· Zod · Vitest · Playwright · `@sveltejs/adapter-vercel` · PWA · optional
PostgreSQL via Drizzle ORM (fully stateless without it).

## Architecture

```
Browser ──▶ SvelteKit routes/pages ──▶ /api/* gateway routes ──▶ services ──▶ providers ──▶ official APIs
```

- The browser **never** calls an external provider directly. All upstream access
  happens server-side through `/api/*`, which enforces validation, caching, rate
  limiting and error classification.
- Providers are isolated behind a `DataProvider` contract and normalize into one
  unified `DisasterEvent` model, so a source can be swapped without touching
  business logic.
- Every provider call has timeout, retry with backoff, in-flight de-duplication,
  schema validation, TTL cache with stale fallback, and structured logging.
  **The app never crashes when a provider fails** — it degrades and says so.
- Persistence is **optional and off the critical path**: when a database is
  configured, events are written fire-and-forget and read back best-effort. All
  database access goes through a `safely()` wrapper, so storage can only ever
  cost history — never availability.

### Data categories are never conflated

Every event carries exactly one category:
`forecast` · `early_warning` · `current_event` · `observation` · `historical` ·
`hazard` · `risk`. A forecast is never shown as a warning; a hazard map is never
shown as a current event. The UI renders the category on every card and popup.

## Project structure

```
src/
├── app.html                     # PWA + theme bootstrap (no secrets)
├── hooks.server.ts              # security headers, CSP, structured error logging
├── lib/
│   ├── api/                     # browser API client + response types
│   ├── assets/                  # favicon
│   ├── components/
│   │   ├── layout/              # Header, Footer, BottomNav, OfflineBanner
│   │   ├── map/MapView.svelte   # MapLibre map (clustering, popups, layers)
│   │   ├── search/SearchBox.svelte
│   │   ├── ui/                  # chips, cards, notices, risk badge, status bar
│   │   └── EventCard.svelte
│   ├── data/                    # bundled BPS/BIG province + regency reference tables
│   ├── map/layers.ts            # GeoJSON assembly + MapLibre style definitions
│   ├── server/
│   │   ├── api/                 # envelopes, rate limiting, Zod validation
│   │   ├── cache/               # TTL cache with stale-while-revalidate
│   │   ├── config.ts            # all endpoints, TTLs, limits (env-driven)
│   │   ├── db/                  # OPTIONAL PostgreSQL: schema, client, repository
│   │   ├── http.ts              # fetchJson: timeout, retry, dedupe, logging
│   │   ├── xml.ts               # dependency-free XML reader (CAP parsing)
│   │   ├── logger.ts            # structured JSON logging
│   │   ├── providers/           # bmkg/, pvmbg/, bnpb/, inarisk/ adapters
│   │   ├── risk/engine.ts       # transparent, explainable risk scoring
│   │   └── services/            # aggregate, merge, health, dashboard, seasons
│   ├── stores/                  # theme, async resource
│   ├── types/                   # canonical disaster domain model
│   └── utils/                   # geo, format (id-ID), severity tokens, regions
├── routes/
│   ├── +layout.svelte           # shell, theme, PWA SW registration
│   ├── +page.svelte             # homepage summary
│   ├── +error.svelte
│   ├── map/                     # full-screen map
│   ├── warnings/                # BMKG CAP early warnings
│   ├── earthquakes/             # earthquake records
│   ├── volcanoes/               # PVMBG/MAGMA activity levels
│   ├── weather/                 # region picker
│   ├── seasons/                 # seasonal context
│   ├── statistics/              # counts over a window
│   ├── status/                  # provider health
│   ├── sources/                 # provenance & attribution
│   ├── about/                   # about & disclaimers
│   ├── offline/                 # PWA offline fallback
│   ├── event/[id]/              # event detail
│   ├── location/[regionCode]/   # region detail (weather + nearby)
│   └── api/                     # server-side gateway endpoints
static/
├── manifest.webmanifest         # PWA manifest
├── service-worker.js            # offline shell (API is always network-only)
├── icons/                       # app icons (incl. maskable)
└── robots.txt
```

## Data sources

| Source                                         | Domains                                           | Categories                                                 | Notes                                                                                             |
| ---------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **BMKG** (`data.bmkg.go.id`, `api.bmkg.go.id`) | Earthquakes, weather forecast, CAP early warnings | `current_event`, `historical`, `forecast`, `early_warning` | Earthquakes are _occurred_ events. Weather API is `adm4`-only.                                    |
| **PVMBG / MAGMA** (`magma.esdm.go.id`)         | Volcano activity levels I–IV                      | `hazard`, `current_event`                                  | Activity level is the official published status. Coordinates come from a bundled reference table. |
| **BNPB / DIBI**                                | Disaster events                                   | `current_event`, `historical`                              | Public endpoint is not always reachable; the adapter probes and reports honestly.                 |
| **InaRISK**                                    | Hazard maps                                       | `hazard`, `risk`                                           | Areal assessment, never merged with active warnings.                                              |
| **BPS / BIG**                                  | Region codes & coordinates                        | reference                                                  | Bundled static table; never presented as hazard data.                                             |
| **OpenStreetMap / CARTO**                      | Basemap                                           | —                                                          | Map tiles only.                                                                                   |

If a source is unreachable, the app shows an **unavailable** state rather than a
substitute. **No disaster data is ever fabricated.**

## API endpoints

All responses use a uniform envelope: `{ success, data, meta }` on success and
`{ success: false, error: { code, message } }` on failure. Every endpoint is
rate-limited and validates its query with Zod.

| Endpoint                           | Purpose                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /api/dashboard`               | Homepage payload: warnings, earthquakes, volcanoes, ranked events, risk.                          |
| `GET /api/events`                  | Filterable unified event stream (`type`, `category`, `severity`, `province`, `bbox`, `since`, …). |
| `GET /api/earthquakes`             | Earthquake records (`minMagnitude`, `tsunamiOnly`, `includeHistory`).                             |
| `GET /api/warnings`                | BMKG CAP early warnings (`level`, `province`, `includeExpired`).                                  |
| `GET /api/volcanoes`               | PVMBG/MAGMA activity levels (`level`, `aboveNormalOnly`).                                         |
| `GET /api/weather?adm4=…`          | BMKG forecast for a village-level code.                                                           |
| `GET /api/regions`                 | Region lookup (`q`, `province`) from the bundled table.                                           |
| `GET /api/nearby?lat&lng&radiusKm` | Events within a radius (coordinate used in-process only).                                         |
| `GET /api/risk`                    | Internal Risk Score with full factor breakdown + disclaimer.                                      |
| `GET /api/statistics?window=7d`    | Counts over a real time window.                                                                   |
| `GET /api/sources`                 | Provenance catalogue.                                                                             |
| `GET /api/status`                  | Provider health (`?probe=1` for a live check).                                                    |

## Environment

Copy `.env.example` to `.env`. **Every variable is optional** — the app ships
with the official endpoints as defaults. Only `PUBLIC_*` variables reach the
browser, and no secret may ever be `PUBLIC_`. No API secrets are exposed to the
frontend.

### Optional persistence

The app is **stateless by default** and runs with zero configuration. Setting
`DATABASE_URL` opts into durable storage of normalized events, which is used to
give `/api/statistics` real history beyond the current process's lifetime:

- **Without `DATABASE_URL`** — statistics are computed from live events only,
  and the API reports `persisted: false`. Nothing else changes.
- **With `DATABASE_URL`** — events are upserted on every aggregation (fire and
  forget), and statistics merge live + persisted history, reporting
  `persisted: true` and how many rows came from storage.

A database outage can **never** break a request: every read and write goes
through a `safely()` wrapper that degrades to the in-memory path on any error.
`GET /api/status` reports the active mode under `persistence.mode`
(`stateless` | `durable`).

### Spatial search

When a database is configured, `GET /api/nearby` performs the radius search in
SQL using PostgreSQL's built-in **`cube` + `earthdistance`** extensions (enabled
by the committed migration), with a GiST index for the bounding-box prefilter.
This is real great-circle geometry — no planar approximation, and **no PostGIS
dependency**. The query combines durable history with live events, and reports
`searchedHistory` so callers know which path produced the result. Without a
database (or without the extensions) it falls back to in-memory distance
filtering over the live aggregate and reports `searchedHistory: false`.

```sh
createdb disaster_monitor
DATABASE_URL=postgres://user@localhost:5432/disaster_monitor npm run db:push
```

The schema lives in `src/lib/server/db/schema.ts`; generated SQL migrations are
committed under `drizzle/`.

## Commands

```sh
npm install        # install dependencies
npm run dev        # start the dev server
npm run check      # svelte-check + TypeScript diagnostics
npm run test       # run the unit test suite (Vitest)
npm run test:e2e   # run Playwright end-to-end tests
npm run lint       # ESLint + Prettier check
npm run format     # auto-format
npm run build      # production build
npm run preview    # preview the production build

# optional database (only needed when DATABASE_URL is set)
npm run db:generate   # generate a SQL migration from the schema
npm run db:push       # push the schema to the database (no migration files)
npm run db:migrate    # apply committed migrations
npm run db:studio     # open Drizzle Studio
```

## Tests

- **Unit tests** (Vitest) cover the provider normalizers (BMKG earthquake, BMKG
  CAP warning incl. lat/lon→lon/lat polygon inversion, PVMBG volcano), the XML
  reader, the risk engine, event merging/deduplication, statistics composition,
  the optional persistence layer's disabled-path contract, and the
  geo/format/region utilities. Fixtures are **real captured payloads** from the
  official APIs.
- **End-to-end tests** (Playwright) cover pages rendering, map mount, filters,
  detail pages and mobile responsiveness.

```sh
npx vitest run                 # all unit tests
npx vitest run path/to/spec.ts # a single spec
```

## Known limitations

- The regional/province GeoJSON is **not bundled** on first load (to keep payloads
  small); boundaries beyond point/area events come from the basemap.
- **BNPB and InaRISK public endpoints are frequently unreachable.** The adapters
  probe them and return zero events with an honest "unavailable" status. Their
  normalizers are complete, so real data flows in automatically if the endpoints
  become reachable (or if a mirror is configured).
- **BMKG weather is `adm4`-only.** `adm1`/`adm2`/`adm3` return HTML from the
  public API, so provinces/regencies use the capital's `adm4` and say so.
- **MAGMA is slow and its HTML table has no clean JSON API.** Parsing is wrapped
  with a long timeout and always has a stale-cache fallback; if the page structure
  changes, the provider surfaces an error rather than an empty volcano layer.
- **The Risk Score is an internal indicator**, not an official warning, and its
  weights are a documented heuristic — the full breakdown is always shown.
- **Rate limiting and the event store are per-instance** (in-process), so on
  serverless they are best-effort guardrails rather than global quotas. Durable
  history via `DATABASE_URL` is the remedy for the event store specifically.
- **Persistence is optional and off by default.** Without `DATABASE_URL`,
  statistics and `/api/nearby` reflect only what the current process has seen.
  No DB is required for any feature. Spatial search uses `cube`/`earthdistance`
  rather than PostGIS to avoid a heavyweight dependency.
- **Seasonal context is national and coarse** (calendar-month based), not a
  region-level seasonal forecast.

## Next development

- Ingest BMKG "Prakiraan Awal Musim" per zone for region-level seasonal outlooks.
- Add PostGIS geometry columns for advanced spatial operations (polygon
  containment, intersects) beyond the point-radius search already supported.
- Push notifications for new warnings in a saved region (opt-in, privacy-first).
- Saved locations / favourites with a local-only footprint.
- Additional hazard layers (InaRISK) once a reachable endpoint is available.
- Wave/tsunami-specific products (BMKG `maritim` and tsunami bulletins).

## License & attribution

Data © the respective Indonesian agencies (BMKG, BNPB, PVMBG, BIG, BPS) and map
tiles © OpenStreetMap contributors, © CARTO. This project is a presentation layer
over public official data and is **not affiliated with or endorsed by** any of
these agencies.
