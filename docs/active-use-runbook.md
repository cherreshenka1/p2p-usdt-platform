# Active Use Runbook

## Public user path

1. User opens `/user`.
2. User fills name, email/phone, country, amount, currency, model, network.
3. User accepts uploaded legal documents.
4. System creates order and shows payment instructions.
5. Partner confirms fiat payment.
6. Admin approves or holds.
7. System locks reserve, releases USDT and moves order to settlement.

## Unified presentation path

1. Presenter opens `/demo`.
2. Presenter clicks `Prepare demo` to reset local demo data and activate demo legal documents.
3. Presenter opens `/demo/live-flow`.
4. Presenter creates a live order, confirms fiat as partner, approves as admin and generates settlement.
5. Presenter uses `/demo/user`, `/demo/partner`, `/demo/compliance`, `/demo/treasury`, `/demo/audit` and `/demo/readiness` to explain each role in depth.

## Operator path

1. Partner logs into `/partner` with `P2P_USDT_PARTNER_TOKEN`.
2. Admin logs into `/admin` with `P2P_USDT_ADMIN_TOKEN`.
3. Admin uploads legal docs and checks `/api/readiness`.
4. Admin reviews unmatched/mismatched payments daily.
5. Finance generates settlement batch daily.

## What remains external

- Final legal agreements.
- Real KYC/KYB provider.
- Real bank/PSP statement import.
- Real wallet/custody release.
- Production PostgreSQL if JSON storage is not enough.
