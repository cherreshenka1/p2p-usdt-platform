import { makeId, nowIso } from "../domain/index.js";

export function normalizeBankTransaction(input, bankAccountId) {
  return {
    id: input.id || makeId("banktx"),
    bankAccountId,
    amount: Number(input.amount),
    currency: input.currency || "USD",
    senderName: input.senderName || "Unknown Sender",
    senderAccountHash: input.senderAccountHash || hashLike(input.senderName || "unknown"),
    paymentReference: input.paymentReference || input.reference || "",
    receivedAt: input.receivedAt || nowIso(),
    rawProviderPayload: input,
    status: "imported",
    matchedOrderId: null
  };
}

function hashLike(value) {
  return `hash_${String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24)}`;
}
