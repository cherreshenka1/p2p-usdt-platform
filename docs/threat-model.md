# Threat Model

## Risks

- fake payment confirmation
- third-party payment
- duplicate bank transaction
- wrong reference ID
- reserve exhaustion
- unauthorized admin action
- partner changes bank details without approval
- PII leakage

## Controls

- reference ID matching
- sender/KYC matching
- manual review for mismatches
- reserve lock before release
- immutable audit log
- partner wallet whitelist
- no hard delete for financial records
- production MFA and RBAC
