# Release Checklist

## Required before public traffic

- Set `P2P_USDT_LAUNCH_MODE=production`.
- Set `P2P_USDT_BIND_HOST=0.0.0.0`.
- Set real `P2P_USDT_PUBLIC_BASE_URL`.
- Set strict `P2P_USDT_CORS_ORIGIN`.
- Replace `P2P_USDT_ADMIN_TOKEN` and `P2P_USDT_PARTNER_TOKEN` with long random secrets.
- Upload active legal documents in `/admin`.
- Configure final model and partners.
- Confirm at least one approved partner bank account.
- Confirm USDT reserve and whitelisted wallet.
- Replace `P2P_USDT_KYC_MODE=demo` with provider flow before real financial use.
- Run `/api/readiness` and clear production blockers.

## Recommended infrastructure

- Reverse proxy with HTTPS.
- WAF/rate limit in front of app.
- Private admin/partner network or VPN where possible.
- Off-machine encrypted backups for `data/db.json` or production PostgreSQL.
- Centralized logs.
- Monitoring on health/readiness, reserve level, unmatched payments, compliance holds.

## Deploy

```bash
docker compose up --build -d
```

## Smoke

```bash
curl https://example.com/api/health
curl https://example.com/api/readiness
```
