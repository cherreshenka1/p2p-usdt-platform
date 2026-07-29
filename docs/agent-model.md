# Agent / Collecting Partner Model

## Роль

Юрлицо принимает фиат как платежный партнер биржи. Пользователь воспринимает операцию как пополнение аккаунта на бирже.

## User disclosure

`Фиатный платеж принимает [legal entity] как платежный партнер биржи по вашей заявке на пополнение.`

## Flow

1. Биржа проводит KYC.
2. Пользователь создает заявку.
3. Биржа формирует сумму, курс, reference ID.
4. Биржа показывает реквизиты юрлица.
5. Пользователь отправляет фиат.
6. Юрлицо подтверждает поступление.
7. Биржа сверяет платеж и заявку.
8. USDT списывается из reserve/escrow.
9. Пользователь получает USDT.
10. Биржа и юрлицо делают settlement.

## Implementation impact

- `partner.modelType = agent`
- primary user counterparty: exchange
- fiat funds treated as collected under the exchange flow
- strongest controls: separate accounting, no payments without order, no third-party payments, daily reconciliation
