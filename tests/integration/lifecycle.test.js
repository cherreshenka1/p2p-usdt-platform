import test from "node:test";
import assert from "node:assert/strict";
import { calculateQuote, createOrder, createSeedData, OrderStatus, transitionOrder } from "../../packages/domain/index.js";
import { normalizeBankTransaction } from "../../packages/integrations/bank-import.js";
import { applyPaymentMatch, matchBankTransactionToOrder } from "../../packages/matching/index.js";
import { runComplianceCheck } from "../../packages/compliance/index.js";
import { lockReserve, releaseReserveToUser } from "../../packages/ledger/index.js";
import { generateSettlementBatch } from "../../packages/settlement/index.js";

test("happy path agent model reaches settlement", () => {
  const db = createSeedData();
  const user = db.users[0];
  const kycProfile = db.kycProfiles[0];
  const partner = db.partners.find((item) => item.modelType === "agent");
  const order = createOrder({
    user,
    partner,
    quote: calculateQuote({ fiatAmount: 1000, fiatCurrency: "USD", modelType: "agent" })
  });
  db.orders.push(order);
  const tx = normalizeBankTransaction({
    amount: order.fiatAmount,
    currency: order.fiatCurrency,
    senderName: kycProfile.legalName,
    paymentReference: order.referenceId
  }, db.partnerBankAccounts[0].id);
  db.bankTransactions.push(tx);
  const match = matchBankTransactionToOrder({ order, user, kycProfile, bankTransaction: tx });
  applyPaymentMatch(db, order, tx, match, "test");
  assert.equal(order.status, OrderStatus.MATCHED);

  const complianceCheck = runComplianceCheck({ order, user, kycProfile, partner, paymentMatch: match });
  assert.equal(complianceCheck.decision, "approved");
  transitionOrder(order, OrderStatus.APPROVED, "test");
  lockReserve(db, order);
  transitionOrder(order, OrderStatus.RESERVE_LOCKED, "test");
  releaseReserveToUser(db, order);
  transitionOrder(order, OrderStatus.USDT_RELEASED, "test");
  transitionOrder(order, OrderStatus.CREDITED_TO_USER, "test");
  transitionOrder(order, OrderStatus.SETTLEMENT_PENDING, "test");

  const batch = generateSettlementBatch(db, { partnerId: partner.id, actor: "test" });
  assert.equal(batch.orderCount, 1);
  assert.equal(order.status, OrderStatus.SETTLED);
});

test("merchant model uses merchant partner and disclosure path", () => {
  const db = createSeedData();
  const partner = db.partners.find((item) => item.modelType === "merchant");
  const user = db.users[1];
  const order = createOrder({
    user,
    partner,
    quote: calculateQuote({ fiatAmount: 2000, fiatCurrency: "USD", modelType: "merchant" })
  });
  assert.equal(order.modelType, "merchant");
  assert.equal(order.partnerId, partner.id);
  assert.ok(order.referenceId.startsWith("MER-"));
});
