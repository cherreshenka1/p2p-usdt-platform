import { makeId, nowIso } from "../domain/index.js";

const DAILY_LIMIT_USD = 10000;
const HIGH_RISK_COUNTRIES = new Set(["IR", "KP", "SY"]);

export function runComplianceCheck({ order, user, kycProfile, partner, paymentMatch }) {
  const flags = [];
  if (!kycProfile || kycProfile.documentStatus !== "verified") flags.push("kyc_not_verified");
  if (kycProfile?.sanctionsStatus && kycProfile.sanctionsStatus !== "clear") flags.push("sanctions_not_clear");
  if (HIGH_RISK_COUNTRIES.has(user.country)) flags.push("high_risk_country");
  if (Number(order.fiatAmount) > DAILY_LIMIT_USD && order.fiatCurrency === "USD") flags.push("above_single_order_limit");
  if (paymentMatch?.thirdPartyFlag) flags.push("third_party_payment");
  if (paymentMatch?.suspiciousPaymentFlag) flags.push("payment_mismatch");
  if (partner.kybStatus !== "approved") flags.push("partner_kyb_not_approved");
  if (partner.status !== "active") flags.push("partner_not_active");

  const decision = flags.length === 0 ? "approved" : "manual_review";
  return {
    id: makeId("chk"),
    orderId: order.id,
    userId: user.id,
    partnerId: partner.id,
    sanctionsResult: kycProfile?.sanctionsStatus ?? "missing",
    amlRiskScore: calculateRiskScore(flags, kycProfile?.riskLevel),
    velocityResult: Number(order.fiatAmount) > DAILY_LIMIT_USD ? "limit_review" : "ok",
    thirdPartyPaymentResult: paymentMatch?.thirdPartyFlag ? "flagged" : "ok",
    manualReviewRequired: decision !== "approved",
    decision,
    flags,
    createdAt: nowIso(),
    decidedAt: decision === "approved" ? nowIso() : null,
    decidedBy: decision === "approved" ? "system" : null
  };
}

export function createComplianceHold(order, reason, severity = "medium") {
  return {
    id: makeId("hold"),
    orderId: order.id,
    reason,
    severity,
    status: "open",
    openedAt: nowIso(),
    closedAt: null
  };
}

function calculateRiskScore(flags, kycRiskLevel = "low") {
  const base = kycRiskLevel === "high" ? 60 : kycRiskLevel === "medium" ? 35 : 15;
  return Math.min(100, base + flags.length * 12);
}
