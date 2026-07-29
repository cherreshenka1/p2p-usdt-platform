# AML/KYC Reliance

## Responsibilities

- Exchange verifies users.
- Exchange or external provider screens sanctions.
- Partner passes KYB before activation.
- Partner receives only data needed for payment processing.
- Manual review handles third-party payments, mismatches, suspicious velocity and high-risk users.

## Demo checks

- KYC document status must be `verified`.
- Sanctions status must be `clear`.
- Partner KYB must be `approved`.
- Third-party or mismatched bank payment goes to `compliance_review`.

## Production additions

- real KYC provider
- sanctions lists
- transaction monitoring
- suspicious activity reports where required
- retention policy per jurisdiction
