# Merchant / Liquidity Provider Model

## Роль

Юрлицо является самостоятельным продавцом USDT или поставщиком ликвидности. Биржа предоставляет интерфейс, matching, KYC, escrow, ledger и dispute process.

## User disclosure

`Вы покупаете USDT у [legal entity]. Биржа обеспечивает платформу, проверку, escrow, учет и зачисление на ваш баланс.`

## Flow

1. Биржа допускает юрлицо как P2P/OTC merchant.
2. Юрлицо размещает USDT reserve.
3. Пользователь проходит KYC.
4. Пользователь выбирает пополнение через merchant.
5. Биржа показывает курс, сумму и реквизиты merchant.
6. Пользователь отправляет фиат.
7. Merchant подтверждает получение.
8. Биржа проверяет заявку и условия.
9. USDT списывается из reserve merchant.
10. Пользователь получает USDT.

## Implementation impact

- `partner.modelType = merchant`
- primary fiat counterparty: legal entity partner
- fiat becomes merchant revenue after successful execution
- UI and receipt must name merchant as USDT seller
