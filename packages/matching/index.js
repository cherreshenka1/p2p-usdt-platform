import { makeId, namesLookSame, nowIso, OrderStatus, transitionOrder } from "../domain/index.js";

export function matchBankTransactionToOrder({ order, user, kycProfile, bankTransaction }) {
  const reasons = [];
  let score = 0;
  const amountMatched = Number(order.fiatAmount) === Number(bankTransaction.amount);
  const currencyMatched = order.fiatCurrency === bankTransaction.currency;
  const referenceMatched = normalizeRef(order.referenceId) === normalizeRef(bankTransaction.paymentReference);
  const senderMatched = namesLookSame(bankTransaction.senderName, kycProfile?.legalName);
  const paidBeforeExpiry = new Date(bankTransaction.receivedAt).getTime() <= new Date(order.expiresAt).getTime();

  if (amountMatched) score += 25; else reasons.push("wrong_amount");
  if (currencyMatched) score += 15; else reasons.push("wrong_currency");
  if (referenceMatched) score += 35; else reasons.push("wrong_reference_id");
  if (senderMatched) score += 20; else reasons.push("third_party_or_name_mismatch");
  if (paidBeforeExpiry) score += 5; else reasons.push("expired_payment");

  const duplicateFlag = Boolean(bankTransaction.matchedOrderId && bankTransaction.matchedOrderId !== order.id);
  if (duplicateFlag) reasons.push("duplicate_transaction");

  const thirdPartyFlag = !senderMatched;
  const exactMatch = score === 100 && !duplicateFlag;
  const status = exactMatch ? "matched" : "manual_review";

  return {
    id: makeId("match"),
    orderId: order.id,
    bankTransactionId: bankTransaction.id,
    userId: user.id,
    matchScore: score,
    amountMatched,
    currencyMatched,
    referenceMatched,
    senderMatched,
    thirdPartyFlag,
    duplicateFlag,
    expiredPaymentFlag: !paidBeforeExpiry,
    underpaymentFlag: Number(bankTransaction.amount) < Number(order.fiatAmount),
    overpaymentFlag: Number(bankTransaction.amount) > Number(order.fiatAmount),
    suspiciousPaymentFlag: reasons.length > 0,
    reasons,
    status,
    createdAt: nowIso()
  };
}

export function applyPaymentMatch(db, order, bankTransaction, paymentMatch, actor = "system") {
  bankTransaction.status = paymentMatch.status;
  bankTransaction.matchedOrderId = order.id;
  order.bankTransactionId = bankTransaction.id;
  order.paymentMatchId = paymentMatch.id;
  order.riskFlags = [...new Set([...(order.riskFlags || []), ...paymentMatch.reasons])];

  if ([OrderStatus.AWAITING_PAYMENT, OrderStatus.PAYMENT_RECEIVED].includes(order.status)) {
    if (order.status === OrderStatus.AWAITING_PAYMENT) {
      transitionOrder(order, OrderStatus.PAYMENT_RECEIVED, actor);
    }
    transitionOrder(order, OrderStatus.MATCHING_PENDING, actor);
  }

  if (paymentMatch.status === "matched") {
    transitionOrder(order, OrderStatus.MATCHED, actor);
  } else {
    transitionOrder(order, OrderStatus.COMPLIANCE_REVIEW, actor);
  }

  db.paymentMatches.push(paymentMatch);
  return paymentMatch;
}

export function findCandidateOrders(db, bankTransaction) {
  return db.orders.filter((order) => (
    [OrderStatus.AWAITING_PAYMENT, OrderStatus.PAYMENT_RECEIVED, OrderStatus.MATCHING_PENDING, OrderStatus.COMPLIANCE_REVIEW].includes(order.status) &&
    order.fiatCurrency === bankTransaction.currency
  ));
}

function normalizeRef(value = "") {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}
