# P2P USDT Platform

Release-ready MVP scaffold for a `fiat -> USDT` flow between an exchange, a legal-entity partner and users.

Live static role demo:

```text
https://cherreshenka1.github.io/p2p-usdt-platform/
```

The GitHub Pages demo is a browser-only presentation layer with role switching and an interactive lifecycle simulator. The full Node API, admin/partner auth, legal upload and backend checks remain in the main app and should be deployed to a server for production use.

The app supports two operating models:

- `agent`: legal entity acts as collecting/payment partner of the exchange.
- `merchant`: legal entity acts as USDT seller / liquidity provider.

Legal agreements are uploadable through the admin panel. The templates in `docs/` are only placeholders and operational maps.

## Apps

- Unified demo cockpit: `/demo`
- User: `/user`
- Partner: `/partner`
- Admin: `/admin`
- Legal documents: `/legal`
- Health: `/api/health`
- Readiness: `/api/readiness`

## Run locally

```bash
npm run reset
npm run start
```

Default local URL:

```text
http://127.0.0.1:8844
```

Default demo tokens:

```text
Admin:   change-me-admin-token
Partner: change-me-partner-token
```

Replace them for any shared or public environment.

## Public release config

Copy `.env.example` values into your host environment and set:

```bash
PORT=8844
P2P_USDT_BIND_HOST=0.0.0.0
P2P_USDT_PUBLIC_BASE_URL=https://your-domain.example
P2P_USDT_CORS_ORIGIN=https://your-domain.example
P2P_USDT_LAUNCH_MODE=production
P2P_USDT_ADMIN_TOKEN=<long-random-token>
P2P_USDT_PARTNER_TOKEN=<long-random-token>
P2P_USDT_KYC_MODE=provider
```

Then upload final legal documents in `/admin`.

## Demo flow

Recommended client presentation path:

1. Open `/demo`.
2. Click `Prepare demo` to reset the demo workspace and activate placeholder legal documents.
3. Open `Live flow`.
4. Click `User creates order`.
5. Click `Partner confirms fiat`.
6. Click `Admin approves + releases`.
7. Click `Generate settlement`.

Raw role apps are still available at `/user`, `/partner` and `/admin`.

Deep demo routes:

- `/demo/live-flow`
- `/demo/user`
- `/demo/partner`
- `/demo/compliance`
- `/demo/treasury`
- `/demo/audit`
- `/demo/readiness`

## Deploy with Docker

```bash
docker compose up --build -d
```

## Checks

```bash
npm test
```

## Demo-only helper API

`POST /api/demo/prepare` and `POST /api/demo/reset` require the admin token and are disabled when `P2P_USDT_LAUNCH_MODE=production`.

Browser/API checks used during development:

- create -> partner confirm -> admin approve -> settlement -> `settled`
- desktop/mobile `/user`, `/partner`, `/admin`: no console errors and no horizontal overflow

## Important production notes

The code is now release-shaped: auth tokens, protected admin/partner APIs, legal document upload slots, readiness checks, security headers, rate limits, Docker packaging and operational docs are included.

Real production still requires your external decisions/providers:

- final legal agreements
- final operating model and jurisdiction
- KYC/KYB provider
- bank/PSP statement integration
- wallet/custody integration
- PostgreSQL migration if JSON storage is not enough
- monitoring/backups/incident response
