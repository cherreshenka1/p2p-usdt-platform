import crypto from "node:crypto";

const defaultAdminToken = "change-me-admin-token";
const defaultPartnerToken = "change-me-partner-token";

export function getSecurityConfig() {
  return {
    launchMode: process.env.P2P_USDT_LAUNCH_MODE || "demo",
    bindHost: process.env.P2P_USDT_BIND_HOST || "127.0.0.1",
    publicBaseUrl: process.env.P2P_USDT_PUBLIC_BASE_URL || "",
    corsOrigin: process.env.P2P_USDT_CORS_ORIGIN || "*",
    adminToken: process.env.P2P_USDT_ADMIN_TOKEN || defaultAdminToken,
    partnerToken: process.env.P2P_USDT_PARTNER_TOKEN || defaultPartnerToken,
    kycMode: process.env.P2P_USDT_KYC_MODE || "demo",
    defaultAdminToken,
    defaultPartnerToken
  };
}

export function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export function tokenEquals(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function authorize(req, role) {
  const config = getSecurityConfig();
  const token = getBearerToken(req);
  const isAdmin = tokenEquals(token, config.adminToken);
  const isPartner = tokenEquals(token, config.partnerToken);
  if (role === "admin" && isAdmin) return { actorType: "admin", actorId: "admin" };
  if (role === "partner" && (isPartner || isAdmin)) {
    return { actorType: isAdmin ? "admin" : "partnerOperator", actorId: isAdmin ? "admin" : "partner" };
  }
  const error = new Error("Unauthorized");
  error.statusCode = 401;
  throw error;
}

export function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Resource-Policy": "same-origin"
  };
}

export function buildReadinessReport(db) {
  const config = getSecurityConfig();
  const checks = [];
  addCheck(checks, "admin token changed", config.adminToken !== config.defaultAdminToken);
  addCheck(checks, "partner token changed", config.partnerToken !== config.defaultPartnerToken);
  addCheck(checks, "public base url configured", Boolean(config.publicBaseUrl));
  addCheck(checks, "bind host configured for deployment", config.bindHost !== "127.0.0.1");
  addCheck(checks, "at least one active legal document", (db.legalDocuments || []).some((doc) => doc.status === "active"));
  addCheck(checks, "active partner exists", db.partners.some((partner) => partner.status === "active"));
  addCheck(checks, "approved bank accounts exist", db.partnerBankAccounts.some((account) => account.status === "approved" && account.approvedForCryptoPurpose));
  addCheck(checks, "positive USDT reserve exists", db.usdtReserves.some((reserve) => reserve.status === "active" && reserve.availableBalance > 0));
  addCheck(checks, "KYC mode not demo", config.kycMode !== "demo");

  const production = config.launchMode === "production";
  const blockingFailures = checks.filter((check) => !check.pass && (production || check.productionBlocker));
  return {
    mode: config.launchMode,
    ready: blockingFailures.length === 0,
    checks,
    blockingFailures
  };
}

function addCheck(checks, name, pass, productionBlocker = true) {
  checks.push({ name, pass: Boolean(pass), productionBlocker });
}
