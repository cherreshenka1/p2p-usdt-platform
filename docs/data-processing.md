# Data Processing

## Data minimization

Partner should only receive:

- order ID
- reference ID
- fiat amount and currency
- payment deadline
- limited user identity fields needed to match sender
- risk flag if action is required

## Sensitive data

- KYC documents are not sent to partner in the demo model.
- Bank account data should be tokenized in production.
- PII access must be logged.

## Production DPA topics

- controller/processor roles
- purpose of processing
- retention
- deletion
- breach notification
- subprocessors
- cross-border transfer
