import test from "node:test";
import assert from "node:assert/strict";
import { createOrder, calculateQuote, createSeedData } from "../../packages/domain/index.js";
import { matchBankTransactionToOrder } from "../../packages/matching/index.js";
import { normalizeBankTransaction } from "../../packages/integrations/bank-import.js";

test("matching accepts exact amount, currency, sender and reference", () => {
  const db = createSeedData();
  const user = db.users[0];
  const kycProfile = db.kycProfiles[0];
  const partner = db.partners[0];
  const order = createOrder({
    user,
    partner,
    quote: calculateQuote({ fiatAmount: 1000, fiatCurrency: "USD", modelType: partner.modelType })
  });
  const tx = normalizeBankTransaction({
    amount: order.fiatAmount,
    currency: order.fiatCurrency,
    senderName: kycProfile.legalName,
    paymentReference: order.referenceId
  }, db.partnerBankAccounts[0].id);
  const match = matchBankTransactionToOrder({ order, user, kycProfile, bankTransaction: tx });
  assert.equal(match.status, "matched");
  assert.equal(match.matchScore, 100);
  assert.equal(match.thirdPartyFlag, false);
});

test("matching flags third-party payments for manual review", () => {
  const db = createSeedData();
  const user = db.users[0];
  const kycProfile = db.kycProfiles[0];
  const partner = db.partners[0];
  const order = createOrder({
    user,
    partner,
    quote: calculateQuote({ fiatAmount: 1000, fiatCurrency: "USD", modelType: partner.modelType })
  });
  const tx = normalizeBankTransaction({
    amount: order.fiatAmount,
    currency: order.fiatCurrency,
    senderName: "Another Sender",
    paymentReference: order.referenceId
  }, db.partnerBankAccounts[0].id);
  const match = matchBankTransactionToOrder({ order, user, kycProfile, bankTransaction: tx });
  assert.equal(match.status, "manual_review");
  assert.equal(match.thirdPartyFlag, true);
  assert.ok(match.reasons.includes("third_party_or_name_mismatch"));
});
