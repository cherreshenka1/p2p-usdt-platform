# API Spec

## User

- `GET /api/public/config`
- `GET /api/public/legal-documents`
- `GET /api/public/legal-documents/:slug`
- `POST /api/user/orders/quote`
- `POST /api/user/orders`
- `GET /api/user/orders/:id`
- `GET /api/user/orders/:id/payment-instructions`
- `GET /api/user/orders/:id/status`
- `GET /api/user/orders/:id/receipt`
- `POST /api/user/orders/:id/dispute`

## Partner

Requires `Authorization: Bearer <P2P_USDT_PARTNER_TOKEN>`.

- `GET /api/partner/orders`
- `POST /api/partner/orders/:id/confirm-payment`
- `GET /api/partner/reserve`
- `POST /api/partner/reserve/top-up`
- `GET /api/partner/settlements`
- `GET /api/partner/disputes`
- `POST /api/partner/disputes/:id/respond`

## Admin

Requires `Authorization: Bearer <P2P_USDT_ADMIN_TOKEN>`.

- `GET /api/admin/dashboard`
- `GET /api/admin/orders`
- `GET /api/admin/orders/:id`
- `POST /api/admin/orders/:id/approve`
- `POST /api/admin/orders/:id/hold`
- `POST /api/admin/orders/:id/release-hold`
- `POST /api/admin/orders/:id/refund`
- `GET /api/admin/bank-transactions`
- `POST /api/admin/bank-transactions/import`
- `POST /api/admin/bank-transactions/:id/match`
- `GET /api/admin/partners`
- `POST /api/admin/partners`
- `PATCH /api/admin/partners/:id`
- `GET /api/admin/reserves`
- `GET /api/admin/settlements`
- `POST /api/admin/settlements/generate`
- `GET /api/admin/settlements/:id/csv`
- `GET /api/admin/disputes`
- `GET /api/admin/audit-log`
- `GET /api/admin/legal-documents`
- `POST /api/admin/legal-documents`

## Operations

- `GET /api/health`
- `GET /api/readiness`

## Demo cockpit

Requires `Authorization: Bearer <P2P_USDT_ADMIN_TOKEN>` and is disabled in production mode.

- `POST /api/demo/prepare`
- `POST /api/demo/reset`
