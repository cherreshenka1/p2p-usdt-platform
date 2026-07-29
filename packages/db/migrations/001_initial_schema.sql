-- Initial PostgreSQL schema for P2P USDT Platform.
-- Demo app uses JSON storage, this migration is the production DB target.

CREATE TYPE model_type AS ENUM ('agent', 'merchant');
CREATE TYPE order_status AS ENUM (
  'created',
  'quote_locked',
  'awaiting_payment',
  'payment_received',
  'matching_pending',
  'matched',
  'compliance_review',
  'approved',
  'reserve_locked',
  'usdt_released',
  'credited_to_user',
  'settlement_pending',
  'settled',
  'expired',
  'cancelled',
  'disputed',
  'refund_pending',
  'refunded',
  'failed'
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT,
  phone TEXT,
  country TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kyc_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  legal_name TEXT NOT NULL,
  country TEXT NOT NULL,
  document_status TEXT NOT NULL,
  sanctions_status TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  kyc_provider_ref TEXT,
  verified_at TIMESTAMPTZ
);

CREATE TABLE legal_entity_partners (
  id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  model_type model_type NOT NULL,
  kyb_status TEXT NOT NULL,
  risk_rating TEXT NOT NULL,
  status TEXT NOT NULL,
  contract_status TEXT NOT NULL
);

CREATE TABLE partner_bank_accounts (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES legal_entity_partners(id),
  bank_name TEXT NOT NULL,
  account_number_token TEXT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  approved_for_crypto_purpose BOOLEAN NOT NULL DEFAULT false,
  bank_narrative_version TEXT
);

CREATE TABLE partner_wallets (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES legal_entity_partners(id),
  network TEXT NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL,
  approved_at TIMESTAMPTZ
);

CREATE TABLE fiat_deposit_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  partner_id TEXT NOT NULL REFERENCES legal_entity_partners(id),
  model_type model_type NOT NULL,
  fiat_currency TEXT NOT NULL,
  fiat_amount NUMERIC(24, 8) NOT NULL,
  usdt_amount NUMERIC(24, 8) NOT NULL,
  network TEXT NOT NULL,
  exchange_rate NUMERIC(24, 8) NOT NULL,
  spread_rate NUMERIC(12, 8) NOT NULL,
  service_fee NUMERIC(24, 8) NOT NULL,
  network_fee NUMERIC(24, 8) NOT NULL,
  reference_id TEXT NOT NULL UNIQUE,
  status order_status NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status_history JSONB NOT NULL DEFAULT '[]',
  risk_flags JSONB NOT NULL DEFAULT '[]',
  bank_transaction_id TEXT,
  payment_match_id TEXT,
  settlement_batch_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_instructions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES fiat_deposit_orders(id),
  recipient_legal_name TEXT NOT NULL,
  bank_account_id TEXT NOT NULL REFERENCES partner_bank_accounts(id),
  payment_purpose TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  disclosure_text TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bank_transactions (
  id TEXT PRIMARY KEY,
  bank_account_id TEXT NOT NULL REFERENCES partner_bank_accounts(id),
  amount NUMERIC(24, 8) NOT NULL,
  currency TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_account_hash TEXT NOT NULL,
  payment_reference TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  raw_provider_payload JSONB NOT NULL,
  status TEXT NOT NULL,
  matched_order_id TEXT
);

CREATE TABLE payment_matches (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES fiat_deposit_orders(id),
  bank_transaction_id TEXT NOT NULL REFERENCES bank_transactions(id),
  match_score INTEGER NOT NULL,
  amount_matched BOOLEAN NOT NULL,
  currency_matched BOOLEAN NOT NULL,
  reference_matched BOOLEAN NOT NULL,
  sender_matched BOOLEAN NOT NULL,
  third_party_flag BOOLEAN NOT NULL,
  duplicate_flag BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  reasons JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usdt_reserves (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES legal_entity_partners(id),
  network TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  total_balance NUMERIC(24, 8) NOT NULL,
  available_balance NUMERIC(24, 8) NOT NULL,
  locked_balance NUMERIC(24, 8) NOT NULL,
  released_balance NUMERIC(24, 8) NOT NULL,
  minimum_required_reserve NUMERIC(24, 8) NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE usdt_reserve_locks (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES fiat_deposit_orders(id),
  partner_id TEXT NOT NULL REFERENCES legal_entity_partners(id),
  reserve_id TEXT NOT NULL REFERENCES usdt_reserves(id),
  network TEXT NOT NULL,
  amount NUMERIC(24, 8) NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ
);

CREATE TABLE ledger_accounts (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  currency_or_network TEXT NOT NULL,
  balance NUMERIC(24, 8) NOT NULL DEFAULT 0
);

CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  transaction_group_id TEXT NOT NULL,
  order_id TEXT,
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  asset TEXT NOT NULL,
  currency_or_network TEXT NOT NULL,
  debit_amount NUMERIC(24, 8) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(24, 8) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settlement_batches (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES legal_entity_partners(id),
  mode TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  order_count INTEGER NOT NULL,
  total_fiat NUMERIC(24, 8) NOT NULL,
  total_usdt NUMERIC(24, 8) NOT NULL,
  total_fees NUMERIC(24, 8) NOT NULL,
  discrepancy_amount NUMERIC(24, 8) NOT NULL DEFAULT 0,
  report_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settlement_items (
  id TEXT PRIMARY KEY,
  settlement_batch_id TEXT NOT NULL REFERENCES settlement_batches(id),
  order_id TEXT NOT NULL REFERENCES fiat_deposit_orders(id),
  fiat_amount NUMERIC(24, 8) NOT NULL,
  fiat_currency TEXT NOT NULL,
  usdt_amount NUMERIC(24, 8) NOT NULL,
  service_fee NUMERIC(24, 8) NOT NULL,
  spread_rate NUMERIC(12, 8) NOT NULL,
  network_fee NUMERIC(24, 8) NOT NULL,
  adjustment NUMERIC(24, 8) NOT NULL DEFAULT 0,
  status TEXT NOT NULL
);

CREATE TABLE refund_requests (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES fiat_deposit_orders(id),
  bank_transaction_id TEXT,
  amount NUMERIC(24, 8) NOT NULL,
  currency TEXT NOT NULL,
  refund_to_original_sender_only BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dispute_cases (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES fiat_deposit_orders(id),
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  opened_by TEXT NOT NULL,
  evidence TEXT,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE compliance_checks (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES fiat_deposit_orders(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  partner_id TEXT NOT NULL REFERENCES legal_entity_partners(id),
  sanctions_result TEXT NOT NULL,
  aml_risk_score INTEGER NOT NULL,
  velocity_result TEXT NOT NULL,
  third_party_payment_result TEXT NOT NULL,
  manual_review_required BOOLEAN NOT NULL,
  decision TEXT NOT NULL,
  flags JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT
);

CREATE TABLE compliance_holds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES fiat_deposit_orders(id),
  reason TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before JSONB,
  after JSONB,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE legal_documents (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  required_for_order BOOLEAN NOT NULL DEFAULT true,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_status ON fiat_deposit_orders(status);
CREATE INDEX idx_orders_reference_id ON fiat_deposit_orders(reference_id);
CREATE INDEX idx_bank_transactions_reference ON bank_transactions(payment_reference);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
