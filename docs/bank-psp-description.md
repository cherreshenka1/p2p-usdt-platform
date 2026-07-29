# Bank / PSP Description

## Agent model narrative

Юрлицо принимает фиатные платежи как раскрытый payment/collection partner биржи по заявкам пользователей. Каждый входящий платеж связан с KYC-пользователем, order ID, reference ID, суммой, валютой и сроком оплаты.

## Merchant model narrative

Юрлицо является merchant / liquidity provider и продает USDT пользователям через платформу биржи. Биржа обеспечивает интерфейс, KYC, matching, escrow, ledger, лимиты и dispute process.

## Controls

- no payments without order
- reference ID required
- third-party payment flag
- refund to original sender
- daily reconciliation
- reserve and settlement reports
- audit log

## Forbidden

- misleading payment purpose
- hidden crypto-purpose
- unrelated personal card flows
- unlinked cash-in
