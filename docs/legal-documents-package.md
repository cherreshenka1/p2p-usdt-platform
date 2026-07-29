# Legal Documents Package

Все документы являются draft templates и должны быть согласованы с локальными юристами до production.

| Document | Purpose | Implementation impact |
| --- | --- | --- |
| Master Services Agreement | Рамочное сотрудничество биржи и юрлица | задает стороны, ответственность, territory, limits |
| Agency / Fiat Collection Agreement | Агентский прием фиата | нужен для `modelType=agent` |
| Merchant Agreement | Самостоятельная продажа USDT | нужен для `modelType=merchant` |
| Liquidity Provider Agreement | USDT reserve, сети, списания | питает reserve/escrow модуль |
| Settlement & Reconciliation Schedule | T+0/T+1/T+2, отчеты, discrepancies | питает settlement batch |
| AML/KYC Reliance Agreement | кто проверяет пользователя и партнера | питает compliance checks |
| Data Processing Agreement | передача и защита персональных данных | ограничивает partner payload |
| Information Security Addendum | API, доступы, кабинеты, файлы | RBAC, audit log, secrets |
| Wallet Whitelisting & Treasury Policy | кошельки, сети, treasury | whitelist и reserve policy |
| Refund / Chargeback / Fraud Handling Procedure | ошибочные платежи, fraud, disputes | refund/dispute module |
| SLA | сроки подтверждения и ответов | dashboard timers |
| Audit Rights & Reporting Addendum | отчеты, выписки, проверки | exports and audit log |
| Reserve / Security Deposit / Indemnity Terms | rolling reserve, deposit, losses | reserve limits and holds |
