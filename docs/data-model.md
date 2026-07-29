# Data Model

Core records:

- `User`
- `KycProfile`
- `LegalEntityPartner`
- `PartnerBankAccount`
- `PartnerWallet`
- `FiatDepositOrder`
- `PaymentInstruction`
- `BankTransaction`
- `PaymentMatch`
- `UsdtReserve`
- `UsdtReserveLock`
- `LedgerAccount`
- `LedgerEntry`
- `SettlementBatch`
- `SettlementItem`
- `RefundRequest`
- `DisputeCase`
- `ComplianceCheck`
- `ComplianceHold`
- `AuditLog`
- `DocumentTemplate`
- `DisclosureTemplate`
- `LegalDocument`

Production SQL target: `packages/db/migrations/001_initial_schema.sql`.
