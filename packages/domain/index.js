import crypto from "node:crypto";

export const ModelType = Object.freeze({
  AGENT: "agent",
  MERCHANT: "merchant"
});

export const OrderStatus = Object.freeze({
  CREATED: "created",
  QUOTE_LOCKED: "quote_locked",
  AWAITING_PAYMENT: "awaiting_payment",
  PAYMENT_RECEIVED: "payment_received",
  MATCHING_PENDING: "matching_pending",
  MATCHED: "matched",
  COMPLIANCE_REVIEW: "compliance_review",
  APPROVED: "approved",
  RESERVE_LOCKED: "reserve_locked",
  USDT_RELEASED: "usdt_released",
  CREDITED_TO_USER: "credited_to_user",
  SETTLEMENT_PENDING: "settlement_pending",
  SETTLED: "settled",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
  DISPUTED: "disputed",
  REFUND_PENDING: "refund_pending",
  REFUNDED: "refunded",
  FAILED: "failed"
});

export const OrderTransitions = Object.freeze({
  [OrderStatus.CREATED]: [OrderStatus.QUOTE_LOCKED, OrderStatus.CANCELLED],
  [OrderStatus.QUOTE_LOCKED]: [OrderStatus.AWAITING_PAYMENT, OrderStatus.EXPIRED, OrderStatus.CANCELLED],
  [OrderStatus.AWAITING_PAYMENT]: [OrderStatus.PAYMENT_RECEIVED, OrderStatus.EXPIRED, OrderStatus.CANCELLED],
  [OrderStatus.PAYMENT_RECEIVED]: [OrderStatus.MATCHING_PENDING, OrderStatus.DISPUTED],
  [OrderStatus.MATCHING_PENDING]: [OrderStatus.MATCHED, OrderStatus.COMPLIANCE_REVIEW, OrderStatus.REFUND_PENDING],
  [OrderStatus.MATCHED]: [OrderStatus.COMPLIANCE_REVIEW, OrderStatus.APPROVED, OrderStatus.DISPUTED],
  [OrderStatus.COMPLIANCE_REVIEW]: [OrderStatus.APPROVED, OrderStatus.REFUND_PENDING, OrderStatus.DISPUTED],
  [OrderStatus.APPROVED]: [OrderStatus.RESERVE_LOCKED, OrderStatus.FAILED],
  [OrderStatus.RESERVE_LOCKED]: [OrderStatus.USDT_RELEASED, OrderStatus.FAILED],
  [OrderStatus.USDT_RELEASED]: [OrderStatus.CREDITED_TO_USER],
  [OrderStatus.CREDITED_TO_USER]: [OrderStatus.SETTLEMENT_PENDING, OrderStatus.DISPUTED],
  [OrderStatus.SETTLEMENT_PENDING]: [OrderStatus.SETTLED, OrderStatus.DISPUTED],
  [OrderStatus.DISPUTED]: [OrderStatus.APPROVED, OrderStatus.REFUND_PENDING, OrderStatus.FAILED],
  [OrderStatus.REFUND_PENDING]: [OrderStatus.REFUNDED, OrderStatus.DISPUTED],
  [OrderStatus.EXPIRED]: [OrderStatus.REFUND_PENDING],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REFUNDED]: [],
  [OrderStatus.SETTLED]: [],
  [OrderStatus.FAILED]: []
});

export const Networks = ["TRC20", "ERC20", "BEP20"];
export const FiatCurrencies = ["USD", "EUR", "UAH", "AED"];

export function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

export function generateReferenceId(modelType = ModelType.AGENT) {
  const tag = modelType === ModelType.MERCHANT ? "MER" : "AGT";
  const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${tag}-${suffix}`;
}

export function normalizeName(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesLookSame(left, right) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function canTransition(from, to) {
  return Boolean(OrderTransitions[from]?.includes(to));
}

export function transitionOrder(order, nextStatus, actor = "system") {
  if (!canTransition(order.status, nextStatus)) {
    throw new Error(`Invalid order transition ${order.status} -> ${nextStatus}`);
  }
  const previousStatus = order.status;
  order.status = nextStatus;
  order.updatedAt = nowIso();
  order.statusHistory.push({
    at: order.updatedAt,
    actor,
    from: previousStatus,
    to: nextStatus
  });
  return order;
}

export function calculateQuote({ fiatAmount, fiatCurrency = "USD", network = "TRC20", modelType = ModelType.AGENT }) {
  const amount = Number(fiatAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("fiatAmount must be a positive number");
  }
  if (!FiatCurrencies.includes(fiatCurrency)) {
    throw new Error(`Unsupported fiat currency ${fiatCurrency}`);
  }
  if (!Networks.includes(network)) {
    throw new Error(`Unsupported USDT network ${network}`);
  }
  const rates = { USD: 1, EUR: 1.08, UAH: 0.024, AED: 0.2723 };
  const baseUsd = amount * rates[fiatCurrency];
  const spreadRate = modelType === ModelType.MERCHANT ? 0.012 : 0.008;
  const serviceFee = Math.max(1.5, baseUsd * 0.003);
  const networkFee = network === "ERC20" ? 6 : network === "BEP20" ? 0.45 : 1;
  const usdtAmount = Math.max(0, baseUsd * (1 - spreadRate) - serviceFee - networkFee);
  return {
    fiatAmount: roundMoney(amount),
    fiatCurrency,
    network,
    modelType,
    exchangeRate: roundMoney(rates[fiatCurrency]),
    spreadRate,
    serviceFee: roundMoney(serviceFee),
    networkFee: roundMoney(networkFee),
    usdtAmount: roundMoney(usdtAmount),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  };
}

export function getDisclosureText(modelType, partnerName) {
  if (modelType === ModelType.MERCHANT) {
    return `Вы покупаете USDT у ${partnerName}. Биржа обеспечивает платформу, проверку, escrow, учет и зачисление на ваш баланс.`;
  }
  return `Фиатный платеж принимает ${partnerName} как платежный партнер биржи по вашей заявке на пополнение.`;
}

export function createOrder({ user, partner, quote }) {
  const createdAt = nowIso();
  const order = {
    id: makeId("ord"),
    userId: user.id,
    partnerId: partner.id,
    modelType: quote.modelType,
    fiatCurrency: quote.fiatCurrency,
    fiatAmount: quote.fiatAmount,
    usdtAmount: quote.usdtAmount,
    network: quote.network,
    exchangeRate: quote.exchangeRate,
    spreadRate: quote.spreadRate,
    serviceFee: quote.serviceFee,
    networkFee: quote.networkFee,
    referenceId: generateReferenceId(quote.modelType),
    status: OrderStatus.CREATED,
    expiresAt: quote.expiresAt,
    createdAt,
    updatedAt: createdAt,
    statusHistory: [{ at: createdAt, actor: "system", from: null, to: OrderStatus.CREATED }],
    riskFlags: [],
    settlementBatchId: null
  };
  transitionOrder(order, OrderStatus.QUOTE_LOCKED, "system");
  transitionOrder(order, OrderStatus.AWAITING_PAYMENT, "system");
  return order;
}

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function makeAudit({ actorType = "system", actorId = "system", action, entityType, entityId, before = null, after = null, meta = {} }) {
  return {
    id: makeId("aud"),
    actorType,
    actorId,
    action,
    entityType,
    entityId,
    before,
    after,
    meta,
    createdAt: nowIso()
  };
}

export function createSeedData() {
  const at = nowIso();
  return {
    users: [
      {
        id: "usr_demo_001",
        email: "ivan.petrov@example.test",
        phone: "+380501112233",
        country: "UA",
        status: "active",
        createdAt: at
      },
      {
        id: "usr_demo_002",
        email: "maria.sokolova@example.test",
        phone: "+971501112233",
        country: "AE",
        status: "active",
        createdAt: at
      }
    ],
    kycProfiles: [
      {
        userId: "usr_demo_001",
        legalName: "Ivan Petrov",
        country: "UA",
        documentStatus: "verified",
        sanctionsStatus: "clear",
        riskLevel: "low",
        kycProviderRef: "demo-kyc-001",
        verifiedAt: at
      },
      {
        userId: "usr_demo_002",
        legalName: "Maria Sokolova",
        country: "AE",
        documentStatus: "verified",
        sanctionsStatus: "clear",
        riskLevel: "medium",
        kycProviderRef: "demo-kyc-002",
        verifiedAt: at
      }
    ],
    partners: [
      {
        id: "ptr_agent_001",
        legalName: "ABC Payments FZE",
        registrationNumber: "FZE-DEMO-001",
        jurisdiction: "AE",
        modelType: ModelType.AGENT,
        kybStatus: "approved",
        riskRating: "medium",
        status: "active",
        contractStatus: "draft_ready"
      },
      {
        id: "ptr_merchant_001",
        legalName: "ABC Trading FZE",
        registrationNumber: "FZE-DEMO-002",
        jurisdiction: "AE",
        modelType: ModelType.MERCHANT,
        kybStatus: "approved",
        riskRating: "medium",
        status: "active",
        contractStatus: "draft_ready"
      }
    ],
    partnerBankAccounts: [
      {
        id: "bank_agent_usd",
        partnerId: "ptr_agent_001",
        bankName: "Demo Bank",
        accountNumberMasked: "AE00 **** **** 1001",
        currency: "USD",
        status: "approved",
        approvedForCryptoPurpose: true,
        bankNarrativeVersion: "agent-v1"
      },
      {
        id: "bank_merchant_usd",
        partnerId: "ptr_merchant_001",
        bankName: "Demo Bank",
        accountNumberMasked: "AE00 **** **** 2001",
        currency: "USD",
        status: "approved",
        approvedForCryptoPurpose: true,
        bankNarrativeVersion: "merchant-v1"
      }
    ],
    partnerWallets: [
      {
        id: "wal_agent_trc20",
        partnerId: "ptr_agent_001",
        network: "TRC20",
        address: "TRC20_DEMO_AGENT_WHITELISTED",
        status: "approved",
        approvedAt: at
      },
      {
        id: "wal_merchant_trc20",
        partnerId: "ptr_merchant_001",
        network: "TRC20",
        address: "TRC20_DEMO_MERCHANT_WHITELISTED",
        status: "approved",
        approvedAt: at
      }
    ],
    usdtReserves: [
      {
        id: "res_agent_001",
        partnerId: "ptr_agent_001",
        network: "TRC20",
        walletAddress: "TRC20_DEMO_AGENT_WHITELISTED",
        totalBalance: 50000,
        availableBalance: 50000,
        lockedBalance: 0,
        releasedBalance: 0,
        minimumRequiredReserve: 5000,
        status: "active"
      },
      {
        id: "res_merchant_001",
        partnerId: "ptr_merchant_001",
        network: "TRC20",
        walletAddress: "TRC20_DEMO_MERCHANT_WHITELISTED",
        totalBalance: 25000,
        availableBalance: 25000,
        lockedBalance: 0,
        releasedBalance: 0,
        minimumRequiredReserve: 3000,
        status: "active"
      }
    ],
    ledgerAccounts: [
      { id: "ledger_exchange_fees_usdt", ownerType: "exchange", ownerId: "exchange_demo", asset: "USDT", currencyOrNetwork: "TRC20", balance: 0 },
      { id: "ledger_agent_reserve_usdt", ownerType: "partner_reserve", ownerId: "ptr_agent_001", asset: "USDT", currencyOrNetwork: "TRC20", balance: 50000 },
      { id: "ledger_merchant_reserve_usdt", ownerType: "partner_reserve", ownerId: "ptr_merchant_001", asset: "USDT", currencyOrNetwork: "TRC20", balance: 25000 },
      { id: "ledger_user_001_usdt", ownerType: "user", ownerId: "usr_demo_001", asset: "USDT", currencyOrNetwork: "TRC20", balance: 0 },
      { id: "ledger_user_002_usdt", ownerType: "user", ownerId: "usr_demo_002", asset: "USDT", currencyOrNetwork: "TRC20", balance: 0 }
    ],
    orders: [],
    paymentInstructions: [],
    bankTransactions: [],
    paymentMatches: [],
    reserveLocks: [],
    ledgerEntries: [],
    settlementBatches: [],
    settlementItems: [],
    refundRequests: [],
    disputeCases: [],
    complianceChecks: [],
    complianceHolds: [],
    documentTemplates: [],
    disclosureTemplates: [
      { id: "disc_agent_v1", modelType: ModelType.AGENT, text: getDisclosureText(ModelType.AGENT, "[legal entity]") },
      { id: "disc_merchant_v1", modelType: ModelType.MERCHANT, text: getDisclosureText(ModelType.MERCHANT, "[legal entity]") }
    ],
    legalDocuments: [
      {
        id: "legal_terms_placeholder",
        slug: "terms",
        title: "User Terms placeholder",
        version: "draft-placeholder",
        status: "draft",
        requiredForOrder: true,
        content: "Upload final user terms before production launch.",
        updatedAt: at
      },
      {
        id: "legal_privacy_placeholder",
        slug: "privacy",
        title: "Privacy Notice placeholder",
        version: "draft-placeholder",
        status: "draft",
        requiredForOrder: true,
        content: "Upload final privacy notice before production launch.",
        updatedAt: at
      }
    ],
    auditLog: [],
    meta: {
      createdAt: at,
      schemaVersion: 1,
      mode: "demo"
    }
  };
}
