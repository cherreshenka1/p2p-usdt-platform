# Refund & Dispute Flow

## Dispute reasons

- wrong amount
- wrong reference ID
- third-party sender
- duplicate transaction
- expired order
- bank recall or chargeback
- user claims non-crediting

## Refund principles

- refund to original sender only
- no crediting for third-party payments
- all manual decisions are audited
- disputed order can be approved, refunded or failed after review

## Demo endpoints

- `POST /api/user/orders/:id/dispute`
- `POST /api/admin/orders/:id/refund`
- `GET /api/admin/disputes`
- `POST /api/partner/disputes/:id/respond`
