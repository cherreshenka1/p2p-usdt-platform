# Operational Runbook

## Daily

1. Review dashboard.
2. Check unmatched bank transactions.
3. Review compliance holds.
4. Verify reserves above minimum.
5. Generate settlement batch.
6. Export settlement report.

## Launch

1. Set production env vars from `.env.example`.
2. Upload active legal documents in `/admin`.
3. Open `/api/readiness`.
4. Clear blocking failures.
5. Run public user smoke.
6. Start traffic with low limits.

## Manual review

1. Open order detail.
2. Inspect payment match reasons.
3. Inspect KYC/KYB status.
4. Release hold, approve, dispute or refund.
5. Add audit-visible reason.

## Reserve incident

1. Pause partner intake.
2. Top up reserve or reduce limits.
3. Re-run pending approvals.
4. Record incident and settlement adjustment.

## Production readiness

- legal opinion
- bank/PSP acceptance
- production auth and MFA
- real KYC/KYB provider
- real bank statements integration
- custody/wallet integration
- monitoring and alerting
