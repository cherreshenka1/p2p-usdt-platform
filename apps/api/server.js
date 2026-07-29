import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateQuote,
  createOrder,
  getDisclosureText,
  makeId,
  nowIso,
  OrderStatus,
  transitionOrder,
  ModelType
} from "../../packages/domain/index.js";
import { addAudit, ensureDatabase, findById, mutateDb, readDb, resetDatabase, writeDb } from "../../packages/db/store.js";
import { lockReserve, releaseReserveToUser } from "../../packages/ledger/index.js";
import { applyPaymentMatch, findCandidateOrders, matchBankTransactionToOrder } from "../../packages/matching/index.js";
import { createComplianceHold, runComplianceCheck } from "../../packages/compliance/index.js";
import { generateSettlementBatch, settlementToCsv } from "../../packages/settlement/index.js";
import { normalizeBankTransaction } from "../../packages/integrations/bank-import.js";
import { authorize, buildReadinessReport, getSecurityConfig, securityHeaders } from "../../packages/security/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../..");
const port = Number(process.env.PORT || 8844);
const securityConfig = getSecurityConfig();
const bindHost = securityConfig.bindHost;
const rateBuckets = new Map();

if (process.argv.includes("--reset-data")) {
  resetDatabase();
  console.log("Demo database reset.");
  process.exit(0);
}

ensureDatabase();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || "Internal server error"
    });
  }
});

server.listen(port, bindHost, () => {
  const localUrl = `http://127.0.0.1:${port}`;
  console.log(`P2P USDT Platform running at ${localUrl} (bind ${bindHost})`);
  console.log(`User app:    ${localUrl}/user`);
  console.log(`Admin app:   ${localUrl}/admin`);
  console.log(`Partner app: ${localUrl}/partner`);
});

async function routeApi(req, res, url) {
  const method = req.method;
  const pathname = url.pathname;
  if (method === "OPTIONS") {
    res.writeHead(204, responseHeaders());
    res.end();
    return;
  }
  checkRateLimit(req, pathname);
  const body = ["POST", "PATCH", "PUT"].includes(method) ? await readBody(req) : {};

  if (method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, at: nowIso() });
  }

  if (method === "POST" && pathname === "/api/demo/prepare") {
    authorize(req, "admin");
    ensureDemoToolsEnabled();
    return sendJson(res, 201, prepareDemoWorkspace());
  }

  if (method === "POST" && pathname === "/api/demo/reset") {
    authorize(req, "admin");
    ensureDemoToolsEnabled();
    const db = resetDatabase();
    return sendJson(res, 201, { ok: true, readiness: buildReadinessReport(db), dashboard: buildDashboard(db) });
  }

  if (method === "GET" && pathname === "/api/readiness") {
    const db = readDb();
    return sendJson(res, 200, buildReadinessReport(db));
  }

  if (method === "GET" && pathname === "/api/public/config") {
    const db = readDb();
    const activeDocs = (db.legalDocuments || [])
      .filter((doc) => doc.status === "active" || doc.requiredForOrder)
      .map(({ id, slug, title, version, status, requiredForOrder, updatedAt }) => ({ id, slug, title, version, status, requiredForOrder, updatedAt }));
    return sendJson(res, 200, {
      models: Object.values(ModelType),
      partners: db.partners.filter((partner) => partner.status === "active").map((partner) => ({
        id: partner.id,
        legalName: partner.legalName,
        jurisdiction: partner.jurisdiction,
        modelType: partner.modelType
      })),
      currencies: ["USD", "EUR", "UAH", "AED"],
      networks: ["TRC20", "ERC20", "BEP20"],
      legalDocuments: activeDocs,
      kycMode: securityConfig.kycMode
    });
  }

  if (method === "GET" && pathname === "/api/public/legal-documents") {
    const db = readDb();
    return sendJson(res, 200, { legalDocuments: db.legalDocuments || [] });
  }

  const publicLegalDoc = pathname.match(/^\/api\/public\/legal-documents\/([^/]+)$/);
  if (method === "GET" && publicLegalDoc) {
    const db = readDb();
    const doc = (db.legalDocuments || []).find((item) => item.slug === publicLegalDoc[1]);
    if (!doc) throw notFound();
    return sendJson(res, 200, { legalDocument: doc });
  }

  if (method === "GET" && pathname === "/api/config") {
    authorize(req, "admin");
    const db = readDb();
    return sendJson(res, 200, {
      models: Object.values(ModelType),
      users: db.users,
      partners: db.partners,
      currencies: ["USD", "EUR", "UAH", "AED"],
      networks: ["TRC20", "ERC20", "BEP20"],
      legalDocuments: db.legalDocuments || []
    });
  }

  if (method === "POST" && pathname === "/api/user/orders/quote") {
    const db = readDb();
    const partner = pickPartner(db, body.partnerId, body.modelType);
    const quote = calculateQuote({
      fiatAmount: body.fiatAmount,
      fiatCurrency: body.fiatCurrency || "USD",
      network: body.network || "TRC20",
      modelType: partner.modelType
    });
    return sendJson(res, 200, { quote, partner });
  }

  if (method === "POST" && pathname === "/api/user/orders") {
    return sendJson(res, 201, mutateDb((db) => {
      if (!body.acceptedTerms) throw badRequest("Terms acceptance is required");
      const user = body.userId ? findById(db.users, body.userId, "user") : resolveOrCreatePublicUser(db, body);
      const kyc = db.kycProfiles.find((profile) => profile.userId === user.id);
      if (!kyc || kyc.documentStatus !== "verified") {
        throw badRequest("User KYC is not verified");
      }
      const partner = pickPartner(db, body.partnerId, body.modelType);
      const quote = calculateQuote({
        fiatAmount: body.fiatAmount,
        fiatCurrency: body.fiatCurrency || "USD",
        network: body.network || "TRC20",
        modelType: partner.modelType
      });
      const order = createOrder({ user, partner, quote });
      const bankAccount = db.partnerBankAccounts.find((account) => (
        account.partnerId === partner.id &&
        account.currency === quote.fiatCurrency &&
        account.status === "approved"
      ));
      if (!bankAccount) throw badRequest("No approved partner bank account for this currency");
      const instruction = {
        id: makeId("payins"),
        orderId: order.id,
        recipientLegalName: partner.legalName,
        bankAccountId: bankAccount.id,
        bankName: bankAccount.bankName,
        accountNumberMasked: bankAccount.accountNumberMasked,
        paymentPurpose: `USDT order ${order.referenceId}`,
        referenceId: order.referenceId,
        disclosureText: getDisclosureText(partner.modelType, partner.legalName),
        expiresAt: order.expiresAt,
        createdAt: nowIso()
      };
      db.orders.push(order);
      db.paymentInstructions.push(instruction);
      addAudit(db, {
        actorType: "user",
        actorId: user.id,
        action: "order.created",
        entityType: "FiatDepositOrder",
        entityId: order.id,
        after: { status: order.status, modelType: order.modelType, referenceId: order.referenceId }
      });
      return { order, paymentInstruction: instruction };
    }));
  }

  const userOrderInstruction = pathname.match(/^\/api\/user\/orders\/([^/]+)\/payment-instructions$/);
  if (method === "GET" && userOrderInstruction) {
    const db = readDb();
    const orderId = userOrderInstruction[1];
    const order = findById(db.orders, orderId, "order");
    const instruction = db.paymentInstructions.find((item) => item.orderId === order.id);
    return sendJson(res, 200, { order, paymentInstruction: instruction });
  }

  const userOrderStatus = pathname.match(/^\/api\/user\/orders\/([^/]+)\/status$/);
  if (method === "GET" && userOrderStatus) {
    const db = readDb();
    const order = findById(db.orders, userOrderStatus[1], "order");
    return sendJson(res, 200, { id: order.id, status: order.status, history: order.statusHistory, riskFlags: order.riskFlags });
  }

  const userOrderReceipt = pathname.match(/^\/api\/user\/orders\/([^/]+)\/receipt$/);
  if (method === "GET" && userOrderReceipt) {
    const db = readDb();
    const order = findById(db.orders, userOrderReceipt[1], "order");
    const partner = findById(db.partners, order.partnerId, "partner");
    const instruction = db.paymentInstructions.find((item) => item.orderId === order.id);
    return sendJson(res, 200, {
      receipt: {
        orderId: order.id,
        status: order.status,
        modelType: order.modelType,
        partner: partner.legalName,
        fiatAmount: order.fiatAmount,
        fiatCurrency: order.fiatCurrency,
        usdtAmount: order.usdtAmount,
        network: order.network,
        referenceId: order.referenceId,
        disclosureText: instruction?.disclosureText,
        generatedAt: nowIso()
      }
    });
  }

  const userOrderDispute = pathname.match(/^\/api\/user\/orders\/([^/]+)\/dispute$/);
  if (method === "POST" && userOrderDispute) {
    return sendJson(res, 201, mutateDb((db) => {
      const order = findById(db.orders, userOrderDispute[1], "order");
      if (![OrderStatus.DISPUTED, OrderStatus.REFUND_PENDING, OrderStatus.REFUNDED].includes(order.status)) {
        transitionOrder(order, OrderStatus.DISPUTED, "user");
      }
      const dispute = {
        id: makeId("dsp"),
        orderId: order.id,
        type: body.type || "payment_issue",
        status: "open",
        openedBy: order.userId,
        evidence: body.evidence || body.message || "",
        resolution: null,
        createdAt: nowIso()
      };
      db.disputeCases.push(dispute);
      addAudit(db, {
        actorType: "user",
        actorId: order.userId,
        action: "dispute.opened",
        entityType: "DisputeCase",
        entityId: dispute.id,
        after: dispute
      });
      return { order, dispute };
    }));
  }

  const userOrder = pathname.match(/^\/api\/user\/orders\/([^/]+)$/);
  if (method === "GET" && userOrder) {
    const db = readDb();
    const order = findById(db.orders, userOrder[1], "order");
    return sendJson(res, 200, hydrateOrder(db, order));
  }

  if (method === "GET" && pathname === "/api/partner/orders") {
    authorize(req, "partner");
    const db = readDb();
    const partnerId = url.searchParams.get("partnerId") || "ptr_agent_001";
    const orders = db.orders.filter((order) => order.partnerId === partnerId).map((order) => hydrateOrder(db, order));
    return sendJson(res, 200, { orders });
  }

  const partnerConfirm = pathname.match(/^\/api\/partner\/orders\/([^/]+)\/confirm-payment$/);
  if (method === "POST" && partnerConfirm) {
    authorize(req, "partner");
    return sendJson(res, 201, mutateDb((db) => {
      const order = findById(db.orders, partnerConfirm[1], "order");
      const bankAccount = db.partnerBankAccounts.find((account) => account.partnerId === order.partnerId && account.currency === order.fiatCurrency);
      const user = findById(db.users, order.userId, "user");
      const kyc = db.kycProfiles.find((profile) => profile.userId === user.id);
      const tx = normalizeBankTransaction({
        amount: body.amount ?? order.fiatAmount,
        currency: body.currency ?? order.fiatCurrency,
        senderName: body.senderName ?? kyc?.legalName,
        paymentReference: body.paymentReference ?? order.referenceId
      }, bankAccount.id);
      db.bankTransactions.push(tx);
      const match = matchBankTransactionToOrder({ order, user, kycProfile: kyc, bankTransaction: tx });
      applyPaymentMatch(db, order, tx, match, "partner");
      addAudit(db, {
        actorType: "partnerOperator",
        actorId: order.partnerId,
        action: "payment.confirmed",
        entityType: "BankTransaction",
        entityId: tx.id,
        after: { orderId: order.id, matchStatus: match.status }
      });
      return { order, bankTransaction: tx, paymentMatch: match };
    }));
  }

  if (method === "GET" && pathname === "/api/partner/reserve") {
    authorize(req, "partner");
    const db = readDb();
    const partnerId = url.searchParams.get("partnerId") || "ptr_agent_001";
    return sendJson(res, 200, { reserves: db.usdtReserves.filter((reserve) => reserve.partnerId === partnerId) });
  }

  if (method === "POST" && pathname === "/api/partner/reserve/top-up") {
    authorize(req, "partner");
    return sendJson(res, 201, mutateDb((db) => {
      const partnerId = body.partnerId || "ptr_agent_001";
      const network = body.network || "TRC20";
      const amount = Number(body.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) throw badRequest("amount must be positive");
      const reserve = db.usdtReserves.find((item) => item.partnerId === partnerId && item.network === network);
      if (!reserve) throw badRequest("reserve not found");
      reserve.totalBalance += amount;
      reserve.availableBalance += amount;
      addAudit(db, {
        actorType: "partnerOperator",
        actorId: partnerId,
        action: "reserve.top_up",
        entityType: "UsdtReserve",
        entityId: reserve.id,
        after: { amount, availableBalance: reserve.availableBalance }
      });
      return { reserve };
    }));
  }

  if (method === "GET" && pathname === "/api/partner/settlements") {
    authorize(req, "partner");
    const db = readDb();
    const partnerId = url.searchParams.get("partnerId") || "ptr_agent_001";
    return sendJson(res, 200, { settlements: db.settlementBatches.filter((batch) => batch.partnerId === partnerId) });
  }

  if (method === "GET" && pathname === "/api/partner/disputes") {
    authorize(req, "partner");
    const db = readDb();
    const partnerId = url.searchParams.get("partnerId") || "ptr_agent_001";
    const partnerOrderIds = new Set(db.orders.filter((order) => order.partnerId === partnerId).map((order) => order.id));
    return sendJson(res, 200, { disputes: db.disputeCases.filter((item) => partnerOrderIds.has(item.orderId)) });
  }

  const partnerDisputeResponse = pathname.match(/^\/api\/partner\/disputes\/([^/]+)\/respond$/);
  if (method === "POST" && partnerDisputeResponse) {
    authorize(req, "partner");
    return sendJson(res, 200, mutateDb((db) => {
      const dispute = findById(db.disputeCases, partnerDisputeResponse[1], "dispute");
      dispute.partnerResponse = body.response || "";
      dispute.status = "partner_responded";
      addAudit(db, {
        actorType: "partnerOperator",
        actorId: "partner",
        action: "dispute.partner_responded",
        entityType: "DisputeCase",
        entityId: dispute.id,
        after: { status: dispute.status }
      });
      return { dispute };
    }));
  }

  if (method === "GET" && pathname === "/api/admin/dashboard") {
    authorize(req, "admin");
    const db = readDb();
    return sendJson(res, 200, buildDashboard(db));
  }

  if (method === "GET" && pathname === "/api/admin/orders") {
    authorize(req, "admin");
    const db = readDb();
    const status = url.searchParams.get("status");
    const orders = db.orders
      .filter((order) => !status || order.status === status)
      .map((order) => hydrateOrder(db, order));
    return sendJson(res, 200, { orders });
  }

  const adminOrder = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (method === "GET" && adminOrder) {
    authorize(req, "admin");
    const db = readDb();
    const order = findById(db.orders, adminOrder[1], "order");
    return sendJson(res, 200, hydrateOrder(db, order));
  }

  const adminApprove = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/approve$/);
  if (method === "POST" && adminApprove) {
    authorize(req, "admin");
    return sendJson(res, 200, mutateDb((db) => approveOrder(db, adminApprove[1], body)));
  }

  const adminHold = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/hold$/);
  if (method === "POST" && adminHold) {
    authorize(req, "admin");
    return sendJson(res, 201, mutateDb((db) => {
      const order = findById(db.orders, adminHold[1], "order");
      const hold = createComplianceHold(order, body.reason || "manual_review", body.severity || "medium");
      db.complianceHolds.push(hold);
      if (order.status === OrderStatus.MATCHED) {
        transitionOrder(order, OrderStatus.COMPLIANCE_REVIEW, "admin");
      }
      addAudit(db, {
        actorType: "complianceOfficer",
        actorId: "admin",
        action: "order.hold",
        entityType: "ComplianceHold",
        entityId: hold.id,
        after: hold
      });
      return { order, hold };
    }));
  }

  const adminReleaseHold = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/release-hold$/);
  if (method === "POST" && adminReleaseHold) {
    authorize(req, "admin");
    return sendJson(res, 200, mutateDb((db) => {
      const order = findById(db.orders, adminReleaseHold[1], "order");
      const holds = db.complianceHolds.filter((hold) => hold.orderId === order.id && hold.status === "open");
      for (const hold of holds) {
        hold.status = "closed";
        hold.closedAt = nowIso();
      }
      addAudit(db, {
        actorType: "complianceOfficer",
        actorId: "admin",
        action: "order.hold_released",
        entityType: "FiatDepositOrder",
        entityId: order.id,
        after: { closedHolds: holds.length }
      });
      return { order, closedHolds: holds.length };
    }));
  }

  const adminRefund = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/refund$/);
  if (method === "POST" && adminRefund) {
    authorize(req, "admin");
    return sendJson(res, 201, mutateDb((db) => refundOrder(db, adminRefund[1], body.reason || "manual_refund")));
  }

  if (method === "GET" && pathname === "/api/admin/bank-transactions") {
    authorize(req, "admin");
    const db = readDb();
    return sendJson(res, 200, { bankTransactions: db.bankTransactions });
  }

  if (method === "POST" && pathname === "/api/admin/bank-transactions/import") {
    authorize(req, "admin");
    return sendJson(res, 201, mutateDb((db) => {
      const transactions = Array.isArray(body.transactions) ? body.transactions : [body];
      const imported = [];
      for (const item of transactions) {
        const bankAccountId = item.bankAccountId || pickDefaultBankAccount(db, item.partnerId, item.currency).id;
        const tx = normalizeBankTransaction(item, bankAccountId);
        db.bankTransactions.push(tx);
        imported.push(tx);
        autoMatchTransaction(db, tx);
      }
      addAudit(db, {
        actorType: "financeOfficer",
        actorId: "admin",
        action: "bank_transactions.imported",
        entityType: "BankTransaction",
        entityId: "batch",
        after: { count: imported.length }
      });
      return { imported };
    }));
  }

  const adminManualMatch = pathname.match(/^\/api\/admin\/bank-transactions\/([^/]+)\/match$/);
  if (method === "POST" && adminManualMatch) {
    authorize(req, "admin");
    return sendJson(res, 200, mutateDb((db) => {
      const tx = findById(db.bankTransactions, adminManualMatch[1], "bank transaction");
      const order = findById(db.orders, body.orderId, "order");
      const user = findById(db.users, order.userId, "user");
      const kyc = db.kycProfiles.find((profile) => profile.userId === user.id);
      const match = matchBankTransactionToOrder({ order, user, kycProfile: kyc, bankTransaction: tx });
      match.status = body.manualOverride ? "matched" : match.status;
      applyPaymentMatch(db, order, tx, match, "finance_admin");
      addAudit(db, {
        actorType: "financeOfficer",
        actorId: "admin",
        action: "bank_transaction.manual_match",
        entityType: "PaymentMatch",
        entityId: match.id,
        after: { orderId: order.id, matchStatus: match.status }
      });
      return { order, bankTransaction: tx, paymentMatch: match };
    }));
  }

  if (method === "GET" && pathname === "/api/admin/partners") {
    authorize(req, "admin");
    const db = readDb();
    return sendJson(res, 200, { partners: db.partners });
  }

  if (method === "POST" && pathname === "/api/admin/partners") {
    authorize(req, "admin");
    return sendJson(res, 201, mutateDb((db) => {
      const partner = {
        id: makeId("ptr"),
        legalName: body.legalName,
        registrationNumber: body.registrationNumber || "draft",
        jurisdiction: body.jurisdiction || "TBD",
        modelType: body.modelType || ModelType.AGENT,
        kybStatus: body.kybStatus || "draft",
        riskRating: body.riskRating || "medium",
        status: body.status || "draft",
        contractStatus: body.contractStatus || "draft"
      };
      if (!partner.legalName) throw badRequest("legalName is required");
      db.partners.push(partner);
      addAudit(db, {
        actorType: "admin",
        actorId: "admin",
        action: "partner.created",
        entityType: "LegalEntityPartner",
        entityId: partner.id,
        after: partner
      });
      return { partner };
    }));
  }

  const patchPartner = pathname.match(/^\/api\/admin\/partners\/([^/]+)$/);
  if (method === "PATCH" && patchPartner) {
    authorize(req, "admin");
    return sendJson(res, 200, mutateDb((db) => {
      const partner = findById(db.partners, patchPartner[1], "partner");
      const before = { ...partner };
      Object.assign(partner, pick(body, ["legalName", "registrationNumber", "jurisdiction", "modelType", "kybStatus", "riskRating", "status", "contractStatus"]));
      addAudit(db, {
        actorType: "admin",
        actorId: "admin",
        action: "partner.updated",
        entityType: "LegalEntityPartner",
        entityId: partner.id,
        before,
        after: partner
      });
      return { partner };
    }));
  }

  if (method === "GET" && pathname === "/api/admin/reserves") {
    authorize(req, "admin");
    const db = readDb();
    return sendJson(res, 200, { reserves: db.usdtReserves });
  }

  if (method === "GET" && pathname === "/api/admin/settlements") {
    authorize(req, "admin");
    const db = readDb();
    return sendJson(res, 200, { settlements: db.settlementBatches });
  }

  if (method === "POST" && pathname === "/api/admin/settlements/generate") {
    authorize(req, "admin");
    return sendJson(res, 201, mutateDb((db) => {
      const batch = generateSettlementBatch(db, {
        partnerId: body.partnerId || "ptr_agent_001",
        mode: body.mode || "daily_close",
        actor: "finance_admin"
      });
      addAudit(db, {
        actorType: "financeOfficer",
        actorId: "admin",
        action: "settlement.generated",
        entityType: "SettlementBatch",
        entityId: batch.id,
        after: batch
      });
      return { settlement: batch };
    }));
  }

  const settlementCsv = pathname.match(/^\/api\/admin\/settlements\/([^/]+)\/csv$/);
  if (method === "GET" && settlementCsv) {
    authorize(req, "admin");
    const db = readDb();
    const batch = findById(db.settlementBatches, settlementCsv[1], "settlement");
    const csv = settlementToCsv(batch, db.settlementItems);
    return sendText(res, 200, csv, "text/csv; charset=utf-8");
  }

  if (method === "GET" && pathname === "/api/admin/disputes") {
    authorize(req, "admin");
    const db = readDb();
    return sendJson(res, 200, { disputes: db.disputeCases });
  }

  if (method === "GET" && pathname === "/api/admin/audit-log") {
    authorize(req, "admin");
    const db = readDb();
    return sendJson(res, 200, { auditLog: db.auditLog.slice().reverse() });
  }

  if (method === "GET" && pathname === "/api/admin/legal-documents") {
    authorize(req, "admin");
    const db = readDb();
    return sendJson(res, 200, { legalDocuments: db.legalDocuments || [] });
  }

  if (method === "POST" && pathname === "/api/admin/legal-documents") {
    authorize(req, "admin");
    return sendJson(res, 201, mutateDb((db) => {
      const doc = upsertLegalDocument(db, body);
      addAudit(db, {
        actorType: "admin",
        actorId: "admin",
        action: "legal_document.upserted",
        entityType: "LegalDocument",
        entityId: doc.id,
        after: { slug: doc.slug, version: doc.version, status: doc.status }
      });
      return { legalDocument: doc };
    }));
  }

  throw notFound();
}

function approveOrder(db, orderId, body = {}) {
  const order = findById(db.orders, orderId, "order");
  const user = findById(db.users, order.userId, "user");
  const partner = findById(db.partners, order.partnerId, "partner");
  const kyc = db.kycProfiles.find((profile) => profile.userId === user.id);
  const paymentMatch = db.paymentMatches.find((match) => match.id === order.paymentMatchId);
  if (![OrderStatus.MATCHED, OrderStatus.COMPLIANCE_REVIEW].includes(order.status)) {
    throw badRequest(`Order must be matched or in compliance_review, current status is ${order.status}`);
  }

  const activeHolds = db.complianceHolds.filter((hold) => hold.orderId === order.id && hold.status === "open");
  if (activeHolds.length > 0 && !body.manualOverride) {
    throw badRequest("Order has active compliance holds; release hold or approve with manualOverride");
  }

  const check = runComplianceCheck({ order, user, kycProfile: kyc, partner, paymentMatch });
  if (check.decision !== "approved" && !body.manualOverride) {
    db.complianceChecks.push(check);
    const hold = createComplianceHold(order, check.flags.join(", ") || "manual_review", "high");
    db.complianceHolds.push(hold);
    if (order.status === OrderStatus.MATCHED) {
      transitionOrder(order, OrderStatus.COMPLIANCE_REVIEW, "compliance");
    }
    addAudit(db, {
      actorType: "complianceOfficer",
      actorId: "system",
      action: "order.compliance_hold",
      entityType: "FiatDepositOrder",
      entityId: order.id,
      after: { flags: check.flags }
    });
    return { order, complianceCheck: check, hold };
  }

  check.decision = "approved";
  check.manualReviewRequired = false;
  check.decidedAt = nowIso();
  check.decidedBy = body.manualOverride ? "admin_manual_override" : "system";
  db.complianceChecks.push(check);

  if (order.status === OrderStatus.MATCHED || order.status === OrderStatus.COMPLIANCE_REVIEW) {
    transitionOrder(order, OrderStatus.APPROVED, "admin");
  }
  const lock = lockReserve(db, order);
  transitionOrder(order, OrderStatus.RESERVE_LOCKED, "ledger");
  const ledgerEntries = releaseReserveToUser(db, order);
  transitionOrder(order, OrderStatus.USDT_RELEASED, "ledger");
  transitionOrder(order, OrderStatus.CREDITED_TO_USER, "exchange");
  transitionOrder(order, OrderStatus.SETTLEMENT_PENDING, "finance");

  addAudit(db, {
    actorType: "admin",
    actorId: "admin",
    action: "order.approved_and_released",
    entityType: "FiatDepositOrder",
    entityId: order.id,
    after: { status: order.status, reserveLockId: lock.id, ledgerEntries: ledgerEntries.length }
  });

  return { order, complianceCheck: check, reserveLock: lock, ledgerEntries };
}

function refundOrder(db, orderId, reason) {
  const order = findById(db.orders, orderId, "order");
  if (order.status === OrderStatus.MATCHED) transitionOrder(order, OrderStatus.COMPLIANCE_REVIEW, "admin");
  if (![OrderStatus.REFUND_PENDING, OrderStatus.REFUNDED].includes(order.status)) {
    transitionOrder(order, OrderStatus.REFUND_PENDING, "admin");
  }
  const refund = {
    id: makeId("ref"),
    orderId: order.id,
    bankTransactionId: order.bankTransactionId || null,
    amount: order.fiatAmount,
    currency: order.fiatCurrency,
    refundToOriginalSenderOnly: true,
    status: "created",
    reason,
    createdAt: nowIso()
  };
  db.refundRequests.push(refund);
  transitionOrder(order, OrderStatus.REFUNDED, "finance");
  refund.status = "completed_demo";
  addAudit(db, {
    actorType: "financeOfficer",
    actorId: "admin",
    action: "order.refunded",
    entityType: "RefundRequest",
    entityId: refund.id,
    after: refund
  });
  return { order, refund };
}

function autoMatchTransaction(db, tx) {
  const candidates = findCandidateOrders(db, tx);
  if (candidates.length === 0) return null;
  let best = null;
  for (const order of candidates) {
    const user = findById(db.users, order.userId, "user");
    const kyc = db.kycProfiles.find((profile) => profile.userId === user.id);
    const match = matchBankTransactionToOrder({ order, user, kycProfile: kyc, bankTransaction: tx });
    if (!best || match.matchScore > best.match.matchScore) best = { order, match };
  }
  if (!best || best.match.matchScore < 35) return null;
  applyPaymentMatch(db, best.order, tx, best.match, "matching_engine");
  return best.match;
}

function buildDashboard(db) {
  const openOrders = db.orders.filter((order) => ![OrderStatus.SETTLED, OrderStatus.REFUNDED, OrderStatus.CANCELLED, OrderStatus.FAILED].includes(order.status));
  const totalFiat = db.orders.reduce((sum, order) => sum + Number(order.fiatAmount || 0), 0);
  const pendingReview = db.orders.filter((order) => [OrderStatus.COMPLIANCE_REVIEW, OrderStatus.DISPUTED].includes(order.status)).length;
  const reserveAvailable = db.usdtReserves.reduce((sum, reserve) => sum + reserve.availableBalance, 0);
  return {
    metrics: {
      orders: db.orders.length,
      openOrders: openOrders.length,
      totalFiat,
      pendingReview,
      reserveAvailable,
      settlements: db.settlementBatches.length
    },
    statuses: countBy(db.orders, "status"),
    models: countBy(db.orders, "modelType"),
    reserves: db.usdtReserves,
    recentOrders: db.orders.slice(-8).reverse().map((order) => hydrateOrder(db, order))
  };
}

function hydrateOrder(db, order) {
  return {
    order,
    user: db.users.find((item) => item.id === order.userId),
    kycProfile: db.kycProfiles.find((item) => item.userId === order.userId),
    partner: db.partners.find((item) => item.id === order.partnerId),
    paymentInstruction: db.paymentInstructions.find((item) => item.orderId === order.id),
    bankTransaction: db.bankTransactions.find((item) => item.id === order.bankTransactionId),
    paymentMatch: db.paymentMatches.find((item) => item.id === order.paymentMatchId),
    reserveLock: db.reserveLocks.find((item) => item.orderId === order.id),
    complianceChecks: db.complianceChecks.filter((item) => item.orderId === order.id),
    complianceHolds: db.complianceHolds.filter((item) => item.orderId === order.id),
    disputes: db.disputeCases.filter((item) => item.orderId === order.id),
    refunds: db.refundRequests.filter((item) => item.orderId === order.id)
  };
}

function resolveOrCreatePublicUser(db, body) {
  const legalName = String(body.legalName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const country = String(body.country || "TBD").trim().toUpperCase();
  if (!legalName) throw badRequest("legalName is required");
  if (!email && !phone) throw badRequest("email or phone is required");
  if (country.length < 2) throw badRequest("country is required");

  let user = db.users.find((candidate) => (
    (email && candidate.email?.toLowerCase() === email) ||
    (phone && candidate.phone === phone)
  ));
  if (!user) {
    user = {
      id: makeId("usr"),
      email,
      phone,
      country,
      status: "active",
      createdAt: nowIso()
    };
    db.users.push(user);
  }

  let kyc = db.kycProfiles.find((profile) => profile.userId === user.id);
  if (!kyc) {
    const demoVerified = securityConfig.kycMode === "demo";
    kyc = {
      userId: user.id,
      legalName,
      country,
      documentStatus: demoVerified ? "verified" : "pending",
      sanctionsStatus: demoVerified ? "clear" : "pending",
      riskLevel: "low",
      kycProviderRef: demoVerified ? "public-demo-kyc" : "external-provider-required",
      verifiedAt: demoVerified ? nowIso() : null
    };
    db.kycProfiles.push(kyc);
  }

  return user;
}

function upsertLegalDocument(db, body) {
  const slug = String(body.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  const title = String(body.title || "").trim();
  const content = String(body.content || "").trim();
  const version = String(body.version || "v1").trim();
  const status = body.status === "active" ? "active" : "draft";
  if (!slug) throw badRequest("slug is required");
  if (!title) throw badRequest("title is required");
  if (!content) throw badRequest("content is required");
  db.legalDocuments ||= [];
  let doc = db.legalDocuments.find((item) => item.slug === slug);
  if (!doc) {
    doc = {
      id: makeId("legal"),
      slug,
      title,
      version,
      status,
      requiredForOrder: body.requiredForOrder !== false,
      content,
      updatedAt: nowIso()
    };
    db.legalDocuments.push(doc);
  } else {
    Object.assign(doc, {
      title,
      version,
      status,
      requiredForOrder: body.requiredForOrder !== false,
      content,
      updatedAt: nowIso()
    });
  }
  return doc;
}

function pickPartner(db, partnerId, modelType) {
  if (partnerId) return findById(db.partners, partnerId, "partner");
  const chosenModel = modelType || process.env.P2P_USDT_DEFAULT_MODEL || ModelType.AGENT;
  const partner = db.partners.find((item) => item.modelType === chosenModel && item.status === "active");
  if (!partner) throw badRequest(`No active partner for model ${chosenModel}`);
  return partner;
}

function pickDefaultBankAccount(db, partnerId, currency = "USD") {
  const account = db.partnerBankAccounts.find((item) => (
    (!partnerId || item.partnerId === partnerId) &&
    item.currency === (currency || "USD") &&
    item.status === "approved"
  ));
  if (!account) throw badRequest("No approved bank account found");
  return account;
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function pick(source, keys) {
  return keys.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) acc[key] = source[key];
    return acc;
  }, {});
}

function serveStatic(req, res, url) {
  if (url.pathname === "/") {
    res.writeHead(302, { Location: "/demo" });
    res.end();
    return;
  }
  if (url.pathname === "/demo" || url.pathname === "/demo/") {
    return sendFile(res, path.join(root, "apps", "web-demo", "index.html"));
  }
  if (url.pathname.startsWith("/demo/")) {
    const relative = url.pathname.slice("/demo/".length);
    const filePath = path.join(root, "apps", "web-demo", relative);
    if (path.extname(relative) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return sendFile(res, filePath);
    }
    return sendFile(res, path.join(root, "apps", "web-demo", "index.html"));
  }
  if (url.pathname === "/legal" || url.pathname === "/legal/") {
    return sendFile(res, path.join(root, "apps", "web-user", "legal.html"));
  }
  const appMap = {
    "/user": "web-user",
    "/admin": "web-admin",
    "/partner": "web-partner"
  };
  for (const [route, appName] of Object.entries(appMap)) {
    if (url.pathname === route || url.pathname === `${route}/`) {
      return sendFile(res, path.join(root, "apps", appName, "index.html"));
    }
    if (url.pathname.startsWith(`${route}/`)) {
      const relative = url.pathname.slice(route.length + 1) || "index.html";
      return sendFile(res, path.join(root, "apps", appName, relative));
    }
  }
  if (url.pathname.startsWith("/shared/")) {
    const relative = url.pathname.slice("/shared/".length);
    return sendFile(res, path.join(root, "packages", "ui", relative));
  }
  throw notFound();
}

function sendFile(res, filePath) {
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(root) || !fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
    throw notFound();
  }
  const ext = path.extname(resolvedPath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml"
  };
  res.writeHead(200, responseHeaders({ "Content-Type": types[ext] || "application/octet-stream" }));
  fs.createReadStream(resolvedPath).pipe(res);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest("Invalid JSON body");
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, responseHeaders({ "Content-Type": "application/json; charset=utf-8" }));
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, responseHeaders({ "Content-Type": contentType }));
  res.end(text);
}

function responseHeaders(extra = {}) {
  return {
    ...securityHeaders(),
    "Access-Control-Allow-Origin": securityConfig.corsOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    ...extra
  };
}

function checkRateLimit(req, pathname) {
  if (req.method === "GET" && !pathname.includes("/receipt")) return;
  const ip = req.socket.remoteAddress || "unknown";
  const key = `${ip}:${pathname}`;
  const now = Date.now();
  const windowMs = 60_000;
  const limit = pathname.startsWith("/api/user/orders") ? 30 : 120;
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (bucket.resetAt < now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > limit) {
    const error = new Error("Rate limit exceeded");
    error.statusCode = 429;
    throw error;
  }
}

function ensureDemoToolsEnabled() {
  if (securityConfig.launchMode === "production") {
    const error = new Error("Demo tools are disabled in production");
    error.statusCode = 403;
    throw error;
  }
}

function prepareDemoWorkspace() {
  const db = resetDatabase();
  const documents = [
    {
      slug: "terms",
      title: "Demo User Terms",
      version: "demo-v1",
      status: "active",
      content: [
        "# Demo User Terms",
        "",
        "This presentation document explains the user journey for a fiat to USDT on-ramp demo.",
        "The final commercial terms, risk disclosures, fees, limits, refund rules and operator details must be uploaded by the project team before production.",
        "",
        "Demo scope: order creation, payment reference, partner confirmation, compliance review, reserve release, settlement and audit trail."
      ].join("\n")
    },
    {
      slug: "privacy",
      title: "Demo Privacy Notice",
      version: "demo-v1",
      status: "active",
      content: [
        "# Demo Privacy Notice",
        "",
        "This presentation document shows where the final privacy notice will be displayed.",
        "The production notice should describe controller details, data categories, KYC/KYB providers, retention, user rights and support contacts.",
        "",
        "Demo data is stored in the local JSON workspace and can be reset from the demo cockpit."
      ].join("\n")
    }
  ];
  for (const document of documents) {
    upsertLegalDocument(db, { ...document, requiredForOrder: true });
  }
  addAudit(db, {
    actorType: "admin",
    actorId: "demo-cockpit",
    action: "demo.workspace_prepared",
    entityType: "DemoWorkspace",
    entityId: "demo",
    after: { legalDocuments: documents.length }
  });
  writeDb(db);
  return {
    ok: true,
    readiness: buildReadinessReport(db),
    dashboard: buildDashboard(db),
    legalDocuments: db.legalDocuments
  };
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function notFound() {
  const error = new Error("Not found");
  error.statusCode = 404;
  return error;
}
