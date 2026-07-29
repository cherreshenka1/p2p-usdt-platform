# Settlement & Reconciliation

## Modes

- `T+0`
- `T+1`
- `T+2`
- `daily_close`
- `manual`

## Batch includes

- executed orders
- fiat amount and currency
- USDT amount and network
- service fee
- spread
- network fee
- refund/dispute adjustment
- discrepancy amount

## Current demo logic

`POST /api/admin/settlements/generate` collects orders with `settlement_pending` or `credited_to_user`, creates `SettlementBatch`, creates `SettlementItem` rows and moves orders to `settled`.
