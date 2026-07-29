const defaults = {
  adminToken: "change-me-admin-token",
  partnerToken: "change-me-partner-token"
};

const routes = [
  { path: "/demo", code: "OV", label: "Overview" },
  { path: "/demo/live-flow", code: "LF", label: "Live flow" },
  { path: "/demo/user", code: "US", label: "User journey" },
  { path: "/demo/partner", code: "PT", label: "Partner desk" },
  { path: "/demo/compliance", code: "CO", label: "Compliance" },
  { path: "/demo/treasury", code: "TR", label: "Treasury" },
  { path: "/demo/audit", code: "AU", label: "Audit room" },
  { path: "/demo/readiness", code: "RD", label: "Readiness" }
];

const statusOrder = [
  "awaiting_payment",
  "payment_received",
  "matching_pending",
  "matched",
  "compliance_review",
  "approved",
  "reserve_locked",
  "usdt_released",
  "credited_to_user",
  "settlement_pending",
  "settled"
];

const state = {
  path: normalizePath(location.pathname),
  loading: true,
  error: "",
  snapshot: null,
  selectedPartnerId: localStorage.getItem("p2p.demo.partnerId") || "ptr_agent_001",
  activeOrderId: localStorage.getItem("p2p.demo.activeOrderId") || "",
  tokens: {
    admin: localStorage.getItem("p2p.demo.adminToken") || defaults.adminToken,
    partner: localStorage.getItem("p2p.demo.partnerToken") || defaults.partnerToken
  },
  draft: {
    legalName: "Ivan Petrov",
    email: "ivan.petrov@example.test",
    phone: "+380501112233",
    country: "UA",
    modelType: "agent",
    fiatAmount: 1250,
    fiatCurrency: "USD",
    network: "TRC20",
    acceptedTerms: true
  },
  toast: ""
};

const app = document.querySelector("#app");

boot();

async function boot() {
  addGlobalHandlers();
  await loadSnapshot();
  render();
}

function addGlobalHandlers() {
  document.addEventListener("click", async (event) => {
    const link = event.target.closest("[data-route]");
    if (link) {
      event.preventDefault();
      navigate(link.getAttribute("href"));
      return;
    }

    const button = event.target.closest("[data-action]");
    if (!button) return;
    event.preventDefault();
    await runAction(button.dataset.action, button.dataset);
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.id !== "demoOrderForm") return;
    event.preventDefault();
    await createDemoOrder();
  });

  document.addEventListener("input", (event) => {
    const field = event.target.dataset.field;
    if (field) {
      state.draft[field] = event.target.type === "checkbox"
        ? event.target.checked
        : event.target.type === "number"
          ? Number(event.target.value)
          : event.target.value;
    }
    const tokenRole = event.target.dataset.token;
    if (tokenRole) {
      state.tokens[tokenRole] = event.target.value;
      localStorage.setItem(`p2p.demo.${tokenRole}Token`, event.target.value);
    }
  });

  document.addEventListener("change", async (event) => {
    if (!event.target.matches("[data-partner-select]")) return;
    state.selectedPartnerId = event.target.value;
    localStorage.setItem("p2p.demo.partnerId", state.selectedPartnerId);
    await loadSnapshot();
  });

  window.addEventListener("popstate", () => {
    state.path = normalizePath(location.pathname);
    render();
  });
}

async function loadSnapshot(silent = false) {
  if (!silent) {
    state.loading = true;
    state.error = "";
    render();
  }
  try {
    const health = await api("/api/health");
    const publicConfig = await api("/api/public/config");
    if (!publicConfig.partners.some((partner) => partner.id === state.selectedPartnerId)) {
      state.selectedPartnerId = publicConfig.partners[0]?.id || "ptr_agent_001";
      localStorage.setItem("p2p.demo.partnerId", state.selectedPartnerId);
    }
    const [
      readiness,
      dashboard,
      orders,
      bank,
      audit,
      disputes,
      settlements,
      legal,
      partnerOrders,
      partnerReserve,
      partnerSettlements,
      partnerDisputes
    ] = await Promise.all([
      api("/api/readiness"),
      api("/api/admin/dashboard", { role: "admin" }),
      api("/api/admin/orders", { role: "admin" }),
      api("/api/admin/bank-transactions", { role: "admin" }),
      api("/api/admin/audit-log", { role: "admin" }),
      api("/api/admin/disputes", { role: "admin" }),
      api("/api/admin/settlements", { role: "admin" }),
      api("/api/admin/legal-documents", { role: "admin" }),
      api(`/api/partner/orders?partnerId=${encodeURIComponent(state.selectedPartnerId)}`, { role: "partner" }),
      api(`/api/partner/reserve?partnerId=${encodeURIComponent(state.selectedPartnerId)}`, { role: "partner" }),
      api(`/api/partner/settlements?partnerId=${encodeURIComponent(state.selectedPartnerId)}`, { role: "partner" }),
      api(`/api/partner/disputes?partnerId=${encodeURIComponent(state.selectedPartnerId)}`, { role: "partner" })
    ]);
    state.snapshot = {
      health,
      publicConfig,
      readiness,
      dashboard,
      orders: orders.orders || [],
      bankTransactions: bank.bankTransactions || [],
      auditLog: audit.auditLog || [],
      disputes: disputes.disputes || [],
      settlements: settlements.settlements || [],
      legalDocuments: legal.legalDocuments || [],
      partnerOrders: partnerOrders.orders || [],
      partnerReserve: partnerReserve.reserves || [],
      partnerSettlements: partnerSettlements.settlements || [],
      partnerDisputes: partnerDisputes.disputes || []
    };
    state.loading = false;
    state.error = "";
  } catch (error) {
    state.loading = false;
    state.error = error.message || "Load failed";
  }
  if (!silent) render();
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.role === "admin") headers.Authorization = `Bearer ${state.tokens.admin}`;
  if (options.role === "partner") headers.Authorization = `Bearer ${state.tokens.partner}`;
  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function render() {
  const page = routeRenderer();
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="mark">UD</div>
          <div>
            <strong>USDT Desk</strong>
            <span>Unified demo cockpit</span>
          </div>
        </div>
        <nav class="nav">
          ${routes.map((route) => `
            <a href="${route.path}" data-route class="${isActive(route.path) ? "active" : ""}">
              <span>${route.code}</span>
              <strong>${route.label}</strong>
            </a>
          `).join("")}
        </nav>
        <div class="status-mini">
          <div>${renderHealthBadge()} ${renderReadyBadge()}</div>
          <div>Active order<br><strong class="mono">${esc(activeOrder()?.order.referenceId || "not created")}</strong></div>
          <div class="actions">
            <button class="ghost" data-action="refresh">Refresh</button>
            <button class="ghost" data-action="prepare">Prepare demo</button>
          </div>
        </div>
      </aside>
      <main class="content">
        ${renderTopline()}
        ${state.loading ? renderLoading() : state.error ? renderError() : page()}
      </main>
    </div>
    ${state.toast ? `<div class="toast">${esc(state.toast)}</div>` : ""}
  `;
}

function renderTopline() {
  const route = routes.find((item) => item.path === state.path) || routes[0];
  return `
    <header class="topline">
      <div>
        <h1>${route.label}</h1>
        <p>${routeDescription(route.path)}</p>
      </div>
      <div class="actions">
        <a class="button-link secondary" href="/user" target="_blank" rel="noreferrer">Raw user</a>
        <a class="button-link secondary" href="/partner" target="_blank" rel="noreferrer">Raw partner</a>
        <a class="button-link secondary" href="/admin" target="_blank" rel="noreferrer">Raw admin</a>
      </div>
    </header>
  `;
}

function renderOverview() {
  const metrics = state.snapshot.dashboard.metrics;
  return `
    <section class="hero role-entry">
      <div class="hero-body">
        <span class="eyebrow">One link for the full product demo</span>
        <h2>Выберите, за кого смотреть приложение.</h2>
        <p>Одна ссылка открывает общий demo-cockpit. Дальше заказчик выбирает роль: клиент, партнер-юрлицо, compliance/admin, treasury или наблюдатель полного сценария.</p>
        <div class="actions">
          <button data-action="prepare">Prepare clean demo</button>
          <a class="button-link ghost" href="/demo/live-flow" data-route>Watch full flow</a>
        </div>
      </div>
      <div class="role-picker">
        ${roleOption("/demo/user", "Client", "Пользователь", "Заявка, disclosure, реквизиты, reference ID и receipt.")}
        ${roleOption("/demo/partner", "Partner", "Юрлицо-партнер", "Подтверждение фиата, mismatch, third-party sender, reserve.")}
        ${roleOption("/demo/compliance", "Admin", "Compliance / Admin", "Approve, hold, refund, readiness и risk cases.")}
        ${roleOption("/demo/treasury", "Finance", "Treasury", "Reserve, USDT release, settlement batches и daily close.")}
        ${roleOption("/demo/live-flow", "Observer", "Полный сценарий", "Пошаговый показ всей сделки до финального settled.")}
      </div>
    </section>

    <section class="grid four">
      ${metricCard("Orders", metrics.orders, `${metrics.openOrders} open`)}
      ${metricCard("Fiat volume", money(metrics.totalFiat), "demo workspace")}
      ${metricCard("Reserve", `${number(metrics.reserveAvailable)} USDT`, "available now")}
      ${metricCard("Review queue", metrics.pendingReview, "holds + disputes")}
    </section>

    <section class="panel">
      <h2>Operating model map</h2>
      ${renderFlowBoard()}
    </section>

    <section class="role-strip">
      ${roleCard("/demo/user", "User journey", "Создать заявку, увидеть disclosure, реквизиты, reference ID и receipt.", "Client-facing")}
      ${roleCard("/demo/partner", "Partner desk", "Подтвердить поступление фиата, показать mismatch, third-party and reserve.", "Legal entity")}
      ${roleCard("/demo/compliance", "Compliance", "Approve, hold, refund, review readiness and KYT-style cases.", "Risk office")}
      ${roleCard("/demo/treasury", "Treasury", "Reserve, release, settlement batch and finance close.", "Finance")}
    </section>

    <section class="panel">
      <h2>Patterns from mature products</h2>
      <div class="source-grid">
        ${sourceCard("P2P order desk", "Order history, appeals, evidence and dispute tracking patterns inspired the live-flow queue.", "Binance P2P")}
        ${sourceCard("Escrow confidence", "Escrow and dispute resolution shaped the reserve-first lifecycle shown to the client.", "Paxful-style P2P")}
        ${sourceCard("Treasury controls", "Policy, audit and stablecoin treasury operations informed the admin/treasury screens.", "Fireblocks")}
        ${sourceCard("KYT alerts", "Real-time risk alerts and case workflow informed the compliance room.", "Chainalysis KYT")}
      </div>
    </section>
  `;
}

function renderLiveFlow() {
  const active = activeOrder();
  return `
    <section class="panel">
      <h2>Presentation script</h2>
      ${renderFlowBoard()}
      <div class="actions" style="margin-top:14px;">
        <button data-action="create-order">1. User creates order</button>
        <button class="secondary" data-action="confirm-payment">2. Partner confirms fiat</button>
        <button class="secondary" data-action="approve-order">3. Admin approves + releases</button>
        <button class="secondary" data-action="generate-settlement">4. Generate settlement</button>
        <button class="warning" data-action="open-dispute">Open dispute branch</button>
      </div>
    </section>
    <section class="split">
      <div class="grid">
        <section class="panel">
          <h2>Active order</h2>
          ${active ? renderOrderTicket(active, true) : empty("Create a live order to start the shared role simulation.")}
        </section>
        <section class="panel">
          <h2>Status timeline</h2>
          ${active ? renderStatusTimeline(active.order) : empty("No order timeline yet.")}
        </section>
      </div>
      <aside class="grid">
        <section class="panel">
          <h2>What the client should notice</h2>
          <div class="rail">
            ${rail("01", "One ID across roles", "Reference ID follows the order from payment instructions to bank match and settlement.")}
            ${rail("02", "Risk gates are visible", "Third-party sender or wrong amount moves the case into manual review instead of silent release.")}
            ${rail("03", "Reserve is controlled", "USDT release consumes partner reserve and leaves ledger/audit evidence.")}
            ${rail("04", "Finance can close", "Settlement batches convert released orders into a daily close pack.")}
          </div>
        </section>
        <section class="panel">
          <h2>Demo controls</h2>
          <div class="actions">
            <button class="secondary" data-action="confirm-wrong">Wrong amount</button>
            <button class="secondary" data-action="confirm-third">Third-party sender</button>
            <button class="danger" data-action="refund-order">Refund</button>
          </div>
        </section>
      </aside>
    </section>
  `;
}

function renderUserJourney() {
  const active = activeOrder();
  return `
    <section class="split">
      <form id="demoOrderForm" class="panel">
        <span class="eyebrow">Client-facing flow</span>
        <h2>New USDT order</h2>
        <div class="form-grid">
          ${input("ФИО", "legalName")}
          ${input("Email", "email", "email")}
          ${input("Телефон", "phone")}
          ${input("Страна", "country")}
          ${select("Модель", "modelType", [["agent", "agent / collecting partner"], ["merchant", "merchant / liquidity provider"]])}
          ${input("Фиатная сумма", "fiatAmount", "number")}
          ${select("Валюта", "fiatCurrency", [["USD", "USD"], ["EUR", "EUR"], ["UAH", "UAH"], ["AED", "AED"]])}
          ${select("Сеть", "network", [["TRC20", "TRC20"], ["ERC20", "ERC20"], ["BEP20", "BEP20"]])}
        </div>
        <label style="margin-top:12px;">
          <span class="actions">
            <input data-field="acceptedTerms" type="checkbox" ${state.draft.acceptedTerms ? "checked" : ""} style="width:auto; min-height:auto;">
            <span>Клиент принимает загруженные условия и privacy notice</span>
          </span>
        </label>
        <div class="actions" style="margin-top:14px;">
          <button type="submit">Create order</button>
          <button type="button" class="secondary" data-action="prepare">Prepare legal docs</button>
        </div>
      </form>
      <aside class="grid">
        <section class="panel">
          <h2>Payment instructions</h2>
          ${active ? renderPaymentInstructions(active) : empty("После создания заявки здесь появятся реквизиты, reference ID и disclosure по выбранной модели.")}
        </section>
        <section class="panel">
          <h2>User receipt</h2>
          ${active ? renderReceipt(active) : empty("Receipt появится после создания заявки и будет обновляться по мере прохождения ролей.")}
        </section>
      </aside>
    </section>
    <section class="panel">
      <h2>Legal documents shown to user</h2>
      ${renderLegalDocuments()}
    </section>
  `;
}

function renderPartnerDesk() {
  const partner = selectedPartner();
  return `
    <section class="split">
      <div class="grid">
        <section class="panel">
          <div class="ticket-head">
            <div>
              <span class="eyebrow">Legal entity operator</span>
              <h2>${esc(partner?.legalName || "Partner")}</h2>
            </div>
            <select data-partner-select style="max-width:290px;">
              ${state.snapshot.publicConfig.partners.map((item) => `<option value="${item.id}" ${item.id === state.selectedPartnerId ? "selected" : ""}>${esc(item.legalName)} (${esc(item.modelType)})</option>`).join("")}
            </select>
          </div>
        </section>
        <section class="panel">
          <h2>Partner orders</h2>
          ${renderPartnerOrders()}
        </section>
      </div>
      <aside class="grid">
        <section class="panel">
          <h2>Reserve</h2>
          ${renderReserves(state.snapshot.partnerReserve)}
          <div class="actions" style="margin-top:12px;">
            <button class="secondary" data-action="top-up">Top-up 1000 USDT</button>
          </div>
        </section>
        <section class="panel">
          <h2>Dispute inbox</h2>
          ${renderDisputeList(state.snapshot.partnerDisputes)}
        </section>
        <section class="panel">
          <h2>Partner settlements</h2>
          ${renderSettlementTable(state.snapshot.partnerSettlements)}
        </section>
      </aside>
    </section>
  `;
}

function renderCompliance() {
  return `
    <section class="grid four">
      ${metricCard("Review queue", state.snapshot.dashboard.metrics.pendingReview, "manual cases")}
      ${metricCard("Bank tx", state.snapshot.bankTransactions.length, "imported or partner-confirmed")}
      ${metricCard("Disputes", state.snapshot.disputes.length, "open and closed")}
      ${metricCard("Readiness", state.snapshot.readiness.ready ? "Ready" : "Todo", state.snapshot.readiness.mode)}
    </section>
    <section class="split">
      <section class="panel">
        <h2>Admin order queue</h2>
        ${renderAdminOrders()}
      </section>
      <aside class="grid">
        <section class="panel">
          <h2>Compliance playbook</h2>
          <div class="rail">
            ${rail("KYC", "Identity gate", "User identity must match payment sender before release.")}
            ${rail("AML", "Transaction gate", "Wrong amount or third-party sender creates manual review.")}
            ${rail("OPS", "Action gate", "Approve, hold, release hold or refund from one queue.")}
            ${rail("AUD", "Evidence gate", "Every decision writes an immutable audit event in demo storage.")}
          </div>
        </section>
        <section class="panel">
          <h2>Readiness snapshot</h2>
          ${renderReadinessChecks(5)}
        </section>
      </aside>
    </section>
  `;
}

function renderTreasury() {
  return `
    <section class="grid three">
      ${metricCard("Available reserve", `${number(state.snapshot.dashboard.metrics.reserveAvailable)} USDT`, "across partners")}
      ${metricCard("Settlement batches", state.snapshot.settlements.length, "daily close packs")}
      ${metricCard("Released orders", settledLikeCount(), "ready for finance")}
    </section>
    <section class="split">
      <div class="grid">
        <section class="panel">
          <h2>Reserve inventory</h2>
          ${renderReserves(state.snapshot.dashboard.reserves)}
        </section>
        <section class="panel">
          <h2>Settlement batches</h2>
          ${renderSettlementTable(state.snapshot.settlements)}
          <div class="actions" style="margin-top:12px;">
            <button data-action="generate-settlement">Generate active partner settlement</button>
          </div>
        </section>
      </div>
      <aside class="panel">
        <h2>Treasury operating controls</h2>
        <div class="rail">
          ${rail("01", "Pre-funded reserve", "Partner reserve must be positive before orders can be released.")}
          ${rail("02", "Reserve lock", "Approve locks the exact USDT amount before crediting the user.")}
          ${rail("03", "Ledger release", "Release creates ledger entries and reduces available reserve.")}
          ${rail("04", "Daily close", "Settlement groups released orders by partner for reconciliation.")}
        </div>
      </aside>
    </section>
  `;
}

function renderAuditRoom() {
  return `
    <section class="split">
      <div class="grid">
        <section class="panel">
          <h2>Audit trail</h2>
          ${renderAuditLog()}
        </section>
        <section class="panel">
          <h2>Bank transactions</h2>
          ${renderBankTransactions()}
        </section>
      </div>
      <aside class="grid">
        <section class="panel">
          <h2>Data room links</h2>
          <div class="rail">
            ${rail("API", "API specification", "docs/api-spec.md")}
            ${rail("ARC", "Architecture", "docs/architecture.md")}
            ${rail("DB", "Data model", "docs/data-model.md")}
            ${rail("RUN", "Runbook", "docs/active-use-runbook.md")}
          </div>
        </section>
        <section class="panel">
          <h2>Token console</h2>
          <div class="grid">
            <label>Admin token<input data-token="admin" value="${esc(state.tokens.admin)}"></label>
            <label>Partner token<input data-token="partner" value="${esc(state.tokens.partner)}"></label>
          </div>
          <div class="actions" style="margin-top:12px;">
            <button class="secondary" data-action="refresh">Reload with tokens</button>
          </div>
        </section>
      </aside>
    </section>
  `;
}

function renderReadiness() {
  return `
    <section class="split">
      <section class="panel">
        <h2>Production readiness</h2>
        <p>Этот блок честно показывает, что уже демонстрируется в продукте, а что должно быть подключено перед реальным публичным трафиком.</p>
        ${renderReadinessChecks()}
      </section>
      <aside class="grid">
        <section class="panel">
          <h2>Launch controls</h2>
          <div class="actions">
            <button data-action="prepare">Prepare demo workspace</button>
            <button class="secondary" data-action="reset">Reset raw seed</button>
          </div>
          <div class="notice warning-note" style="margin-top:12px;">Demo reset disabled automatically when <span class="mono">P2P_USDT_LAUNCH_MODE=production</span>.</div>
        </section>
        <section class="panel">
          <h2>External integrations</h2>
          <div class="rail">
            ${rail("KYC", "KYC/KYB provider", "Real identity, sanctions and KYB verification.")}
            ${rail("BANK", "Bank or PSP feed", "Statement import, matching, refunds and payment purpose acceptance.")}
            ${rail("WAL", "Custody / wallet", "Whitelisted wallets, release controls and treasury monitoring.")}
            ${rail("DB", "PostgreSQL", "Production-grade storage, backups and reporting.")}
          </div>
        </section>
      </aside>
    </section>
  `;
}

function routeRenderer() {
  if (state.path === "/demo/live-flow") return renderLiveFlow;
  if (state.path === "/demo/user") return renderUserJourney;
  if (state.path === "/demo/partner") return renderPartnerDesk;
  if (state.path === "/demo/compliance") return renderCompliance;
  if (state.path === "/demo/treasury") return renderTreasury;
  if (state.path === "/demo/audit") return renderAuditRoom;
  if (state.path === "/demo/readiness") return renderReadiness;
  return renderOverview;
}

async function runAction(action, dataset = {}) {
  try {
    if (action === "refresh") await loadSnapshot();
    if (action === "prepare") await prepareDemo();
    if (action === "reset") await resetDemo();
    if (action === "create-order") await createDemoOrder();
    if (action === "confirm-payment") await confirmPayment("exact", dataset.id);
    if (action === "confirm-wrong") await confirmPayment("wrong", dataset.id);
    if (action === "confirm-third") await confirmPayment("third", dataset.id);
    if (action === "approve-order") await approveOrder(dataset.id);
    if (action === "hold-order") await holdOrder(dataset.id);
    if (action === "refund-order") await refundOrder(dataset.id);
    if (action === "generate-settlement") await generateSettlement();
    if (action === "open-dispute") await openDispute();
    if (action === "top-up") await topUpReserve();
    if (action === "select-partner") {
      state.selectedPartnerId = dataset.value || document.querySelector("[data-action='select-partner']")?.value || state.selectedPartnerId;
      localStorage.setItem("p2p.demo.partnerId", state.selectedPartnerId);
      await loadSnapshot();
    }
  } catch (error) {
    showToast(error.message || "Action failed");
  }
}

async function prepareDemo() {
  const result = await api("/api/demo/prepare", { method: "POST", role: "admin" });
  state.activeOrderId = "";
  localStorage.removeItem("p2p.demo.activeOrderId");
  await reloadAndToast(`Demo prepared: ${result.legalDocuments?.length || 0} legal docs ready`);
}

async function resetDemo() {
  await api("/api/demo/reset", { method: "POST", role: "admin" });
  state.activeOrderId = "";
  localStorage.removeItem("p2p.demo.activeOrderId");
  await reloadAndToast("Workspace reset to raw seed");
}

async function createDemoOrder() {
  const result = await api("/api/user/orders", {
    method: "POST",
    body: { ...state.draft }
  });
  state.activeOrderId = result.order.id;
  localStorage.setItem("p2p.demo.activeOrderId", state.activeOrderId);
  await reloadAndToast(`Order ${result.order.referenceId} created`);
}

async function confirmPayment(mode = "exact", explicitOrderId = "") {
  const item = explicitOrderId ? orderById(explicitOrderId) : activeOrder();
  if (!item) throw new Error("Create an order first");
  const body = {};
  if (mode === "exact") body.senderName = item.kycProfile?.legalName;
  if (mode === "wrong") {
    body.senderName = item.kycProfile?.legalName;
    body.amount = Math.max(1, Number(item.order.fiatAmount) - 37);
  }
  if (mode === "third") body.senderName = "Third Party Sender";
  await api(`/api/partner/orders/${item.order.id}/confirm-payment`, {
    method: "POST",
    role: "partner",
    body
  });
  state.activeOrderId = item.order.id;
  localStorage.setItem("p2p.demo.activeOrderId", state.activeOrderId);
  await reloadAndToast(mode === "exact" ? "Fiat payment matched" : "Payment moved into review branch");
}

async function approveOrder(explicitOrderId = "") {
  const item = explicitOrderId ? orderById(explicitOrderId) : activeOrder();
  if (!item) throw new Error("No active order");
  await api(`/api/admin/orders/${item.order.id}/approve`, {
    method: "POST",
    role: "admin",
    body: { manualOverride: true }
  });
  state.activeOrderId = item.order.id;
  localStorage.setItem("p2p.demo.activeOrderId", state.activeOrderId);
  await reloadAndToast("Order approved, reserve released");
}

async function holdOrder(explicitOrderId = "") {
  const item = explicitOrderId ? orderById(explicitOrderId) : activeOrder();
  if (!item) throw new Error("No active order");
  await api(`/api/admin/orders/${item.order.id}/hold`, {
    method: "POST",
    role: "admin",
    body: { reason: "demo_manual_review", severity: "medium" }
  });
  await reloadAndToast("Compliance hold opened");
}

async function refundOrder(explicitOrderId = "") {
  const item = explicitOrderId ? orderById(explicitOrderId) : activeOrder();
  if (!item) throw new Error("No active order");
  await api(`/api/admin/orders/${item.order.id}/refund`, {
    method: "POST",
    role: "admin",
    body: { reason: "demo_refund" }
  });
  await reloadAndToast("Refund branch completed");
}

async function generateSettlement() {
  const item = activeOrder();
  const partnerId = item?.order.partnerId || state.selectedPartnerId;
  await api("/api/admin/settlements/generate", {
    method: "POST",
    role: "admin",
    body: { partnerId, mode: "presentation_close" }
  });
  await reloadAndToast("Settlement batch generated");
}

async function openDispute() {
  const item = activeOrder();
  if (!item) throw new Error("No active order");
  await api(`/api/user/orders/${item.order.id}/dispute`, {
    method: "POST",
    body: { type: "presentation_issue", message: "Demo dispute opened from cockpit" }
  });
  await reloadAndToast("Dispute branch opened");
}

async function topUpReserve() {
  await api("/api/partner/reserve/top-up", {
    method: "POST",
    role: "partner",
    body: { partnerId: state.selectedPartnerId, network: "TRC20", amount: 1000 }
  });
  await reloadAndToast("Partner reserve topped up");
}

async function reloadAndToast(message) {
  await loadSnapshot(true);
  showToast(message);
}

function renderFlowBoard() {
  const current = activeOrder()?.order.status || "";
  const steps = [
    ["User order", "Client signs terms and gets reference ID.", ["awaiting_payment"]],
    ["Fiat received", "Partner confirms bank payment.", ["payment_received", "matching_pending"]],
    ["Payment match", "Amount, currency, sender and reference are checked.", ["matched"]],
    ["Compliance", "KYC/KYB, third-party and risk gates.", ["compliance_review", "approved"]],
    ["Reserve release", "USDT reserve is locked and credited.", ["reserve_locked", "usdt_released", "credited_to_user", "settlement_pending"]],
    ["Settlement", "Finance closes partner batch.", ["settled"]]
  ];
  return `<div class="flow-board">${steps.map(([title, desc, statuses], index) => {
    const done = isStepDone(current, statuses);
    const active = statuses.includes(current);
    return `
      <div class="flow-step ${done ? "done" : ""} ${active ? "active" : ""}">
        <span class="badge ${active ? "ok" : done ? "info" : ""}">${String(index + 1).padStart(2, "0")}</span>
        <strong>${title}</strong>
        <span>${desc}</span>
      </div>
    `;
  }).join("")}</div>`;
}

function renderOrderTicket(item, verbose = false) {
  const order = item.order;
  return `
    <div class="order-ticket">
      <div class="ticket-head">
        <div>
          <strong class="mono">${esc(order.referenceId)}</strong>
          <span class="badge ${statusTone(order.status)}">${esc(order.status)}</span>
        </div>
        <div class="actions">
          <button class="secondary" data-action="confirm-payment" data-id="${esc(order.id)}">Confirm</button>
          <button class="secondary" data-action="approve-order" data-id="${esc(order.id)}">Approve</button>
          <button class="warning" data-action="generate-settlement">Settle</button>
        </div>
      </div>
      <table>
        <tbody>
          <tr><td>User</td><td>${esc(item.kycProfile?.legalName || item.user?.email || "User")}</td></tr>
          <tr><td>Partner</td><td>${esc(item.partner?.legalName || order.partnerId)} <span class="badge">${esc(order.modelType)}</span></td></tr>
          <tr><td>Fiat</td><td>${money(order.fiatAmount, order.fiatCurrency)}</td></tr>
          <tr><td>USDT</td><td>${number(order.usdtAmount)} ${esc(order.network)}</td></tr>
          ${verbose ? `<tr><td>Order ID</td><td class="mono">${esc(order.id)}</td></tr>` : ""}
        </tbody>
      </table>
    </div>
  `;
}

function renderPaymentInstructions(item) {
  const instruction = item.paymentInstruction;
  if (!instruction) return empty("Payment instruction is not available.");
  return `
    <div class="notice">${esc(instruction.disclosureText)}</div>
    <table style="margin-top:12px;">
      <tbody>
        <tr><td>Recipient</td><td>${esc(instruction.recipientLegalName)}</td></tr>
        <tr><td>Bank</td><td>${esc(instruction.bankName)}</td></tr>
        <tr><td>Account</td><td class="mono">${esc(instruction.accountNumberMasked)}</td></tr>
        <tr><td>Reference</td><td class="mono"><strong>${esc(instruction.referenceId)}</strong></td></tr>
        <tr><td>Purpose</td><td>${esc(instruction.paymentPurpose)}</td></tr>
      </tbody>
    </table>
  `;
}

function renderReceipt(item) {
  return `
    <table>
      <tbody>
        <tr><td>Status</td><td><span class="badge ${statusTone(item.order.status)}">${esc(item.order.status)}</span></td></tr>
        <tr><td>Fiat paid</td><td>${money(item.order.fiatAmount, item.order.fiatCurrency)}</td></tr>
        <tr><td>USDT expected</td><td>${number(item.order.usdtAmount)} ${esc(item.order.network)}</td></tr>
        <tr><td>Reference</td><td class="mono">${esc(item.order.referenceId)}</td></tr>
        <tr><td>Updated</td><td>${time(item.order.updatedAt)}</td></tr>
      </tbody>
    </table>
  `;
}

function renderStatusTimeline(order) {
  return `
    <div class="timeline">
      ${order.statusHistory.slice().reverse().map((event) => `
        <div class="timeline-item">
          <span>${time(event.at)}<br>${esc(event.actor)}</span>
          <strong>${esc(event.from || "start")} -> ${esc(event.to)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPartnerOrders() {
  const rows = state.snapshot.partnerOrders;
  if (!rows.length) return empty("У выбранного партнера пока нет заявок. Создай order в Live flow или User journey.");
  return `
    <table>
      <thead><tr><th>Reference</th><th>Status</th><th>Client</th><th>Amount</th><th>Actions</th></tr></thead>
      <tbody>
        ${rows.map((item) => `
          <tr>
            <td class="mono">${esc(item.order.referenceId)}</td>
            <td><span class="badge ${statusTone(item.order.status)}">${esc(item.order.status)}</span></td>
            <td>${esc(item.kycProfile?.legalName || item.user?.email || "User")}</td>
            <td>${money(item.order.fiatAmount, item.order.fiatCurrency)}<br>${number(item.order.usdtAmount)} USDT</td>
            <td>
              <div class="actions">
                <button data-action="confirm-payment" data-id="${esc(item.order.id)}">Exact</button>
                <button class="secondary" data-action="confirm-wrong" data-id="${esc(item.order.id)}">Wrong</button>
                <button class="warning" data-action="confirm-third" data-id="${esc(item.order.id)}">Third</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderAdminOrders() {
  const rows = state.snapshot.orders;
  if (!rows.length) return empty("No orders yet.");
  return `
    <table>
      <thead><tr><th>Reference</th><th>Status</th><th>Partner</th><th>Risk</th><th>Actions</th></tr></thead>
      <tbody>
        ${rows.map((item) => `
          <tr>
            <td class="mono">${esc(item.order.referenceId)}</td>
            <td><span class="badge ${statusTone(item.order.status)}">${esc(item.order.status)}</span></td>
            <td>${esc(item.partner?.legalName || item.order.partnerId)}<br><span class="badge">${esc(item.order.modelType)}</span></td>
            <td>${renderRisk(item)}</td>
            <td>
              <div class="actions">
                <button data-action="approve-order" data-id="${esc(item.order.id)}">Approve</button>
                <button class="secondary" data-action="hold-order" data-id="${esc(item.order.id)}">Hold</button>
                <button class="danger" data-action="refund-order" data-id="${esc(item.order.id)}">Refund</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderReserves(rows = []) {
  if (!rows.length) return empty("No reserve records.");
  return `
    <table>
      <thead><tr><th>Partner</th><th>Network</th><th>Available</th><th>Locked</th><th>Released</th></tr></thead>
      <tbody>
        ${rows.map((reserve) => `
          <tr>
            <td class="mono">${esc(reserve.partnerId)}</td>
            <td>${esc(reserve.network)}</td>
            <td>${number(reserve.availableBalance)}</td>
            <td>${number(reserve.lockedBalance)}</td>
            <td>${number(reserve.releasedBalance)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderSettlementTable(rows = []) {
  if (!rows.length) return empty("No settlement batches yet.");
  return `
    <table>
      <thead><tr><th>Batch</th><th>Partner</th><th>Orders</th><th>Fiat</th><th>USDT</th></tr></thead>
      <tbody>
        ${rows.slice().reverse().map((batch) => `
          <tr>
            <td class="mono">${esc(batch.id)}</td>
            <td class="mono">${esc(batch.partnerId)}</td>
            <td>${number(batch.orderCount)}</td>
            <td>${money(batch.totalFiat, "USD")}</td>
            <td>${number(batch.totalUsdt)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderDisputeList(rows = []) {
  if (!rows.length) return empty("No disputes.");
  return `
    <div class="timeline">
      ${rows.map((item) => `
        <div class="timeline-item">
          <span>${esc(item.status)}<br>${time(item.createdAt)}</span>
          <strong>${esc(item.type)} · ${esc(item.orderId)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderAuditLog() {
  const rows = state.snapshot.auditLog.slice(0, 20);
  if (!rows.length) return empty("Audit trail is empty.");
  return `
    <div class="timeline">
      ${rows.map((event) => `
        <div class="timeline-item">
          <span>${time(event.createdAt)}<br>${esc(event.actorType)}</span>
          <strong>${esc(event.action)}<br><small class="mono">${esc(event.entityType)} · ${esc(event.entityId)}</small></strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderBankTransactions() {
  const rows = state.snapshot.bankTransactions.slice().reverse();
  if (!rows.length) return empty("No bank transactions yet.");
  return `
    <table>
      <thead><tr><th>Sender</th><th>Reference</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map((tx) => `
          <tr>
            <td>${esc(tx.senderName)}</td>
            <td class="mono">${esc(tx.paymentReference)}</td>
            <td>${money(tx.amount, tx.currency)}</td>
            <td><span class="badge ${tx.status === "matched" ? "ok" : "warn"}">${esc(tx.status)}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderLegalDocuments() {
  const docs = state.snapshot.legalDocuments;
  if (!docs.length) return empty("Legal documents are not uploaded.");
  return `
    <div class="grid two">
      ${docs.map((doc) => `
        <div class="order-ticket">
          <div class="ticket-head">
            <strong>${esc(doc.title)}</strong>
            <span class="badge ${doc.status === "active" ? "ok" : "warn"}">${esc(doc.status)}</span>
          </div>
          <table>
            <tbody>
              <tr><td>Slug</td><td class="mono">${esc(doc.slug)}</td></tr>
              <tr><td>Version</td><td>${esc(doc.version)}</td></tr>
              <tr><td>Required</td><td>${doc.requiredForOrder ? "yes" : "no"}</td></tr>
            </tbody>
          </table>
          <a class="button-link secondary" href="/legal?slug=${encodeURIComponent(doc.slug)}" target="_blank" rel="noreferrer">Open public document</a>
        </div>
      `).join("")}
    </div>
  `;
}

function renderReadinessChecks(limit = Infinity) {
  const checks = state.snapshot.readiness.checks.slice(0, limit);
  return `
    <div class="timeline">
      ${checks.map((check) => `
        <div class="timeline-item">
          <span><span class="badge ${check.pass ? "ok" : "warn"}">${check.pass ? "ok" : "todo"}</span></span>
          <strong>${esc(check.name)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderRisk(item) {
  const flags = [
    ...(item.order.riskFlags || []),
    ...((item.paymentMatch?.flags || [])),
    ...((item.complianceChecks || []).flatMap((check) => check.flags || [])),
    ...((item.complianceHolds || []).map((hold) => hold.reason))
  ];
  if (!flags.length) return `<span class="badge ok">clear</span>`;
  return flags.slice(0, 2).map((flag) => `<span class="badge warn">${esc(flag)}</span>`).join(" ");
}

function metricCard(label, value, detail) {
  return `
    <section class="panel metric">
      <span>${esc(label)}</span>
      <strong>${esc(String(value))}</strong>
      <small>${esc(detail)}</small>
    </section>
  `;
}

function roleCard(path, title, text, badge) {
  return `
    <a class="role-card" href="${path}" data-route>
      <span class="badge info">${esc(badge)}</span>
      <div>
        <h3>${esc(title)}</h3>
        <p>${esc(text)}</p>
      </div>
      <strong>Open module</strong>
    </a>
  `;
}

function roleOption(path, code, title, text) {
  return `
    <a class="role-option" href="${path}" data-route>
      <span>${esc(code)}</span>
      <strong>${esc(title)}</strong>
      <small>${esc(text)}</small>
    </a>
  `;
}

function sourceCard(title, text, linkLabel) {
  return `
    <div class="source-card">
      <span class="eyebrow">${esc(title)}</span>
      <p>${esc(text)}</p>
      <strong>${esc(linkLabel)}</strong>
    </div>
  `;
}

function rail(code, title, text) {
  return `
    <div class="rail-item">
      <b>${esc(code)}</b>
      <div>
        <strong>${esc(title)}</strong>
        <p>${esc(text)}</p>
      </div>
    </div>
  `;
}

function input(label, field, type = "text") {
  return `<label>${esc(label)}<input data-field="${field}" type="${type}" value="${esc(String(state.draft[field] ?? ""))}"></label>`;
}

function select(label, field, options) {
  return `
    <label>${esc(label)}
      <select data-field="${field}">
        ${options.map(([value, text]) => `<option value="${esc(value)}" ${state.draft[field] === value ? "selected" : ""}>${esc(text)}</option>`).join("")}
      </select>
    </label>
  `;
}

function empty(text) {
  return `<div class="empty">${esc(text)}</div>`;
}

function renderLoading() {
  return `<section class="panel">${empty("Loading live demo cockpit...")}</section>`;
}

function renderError() {
  return `
    <section class="panel">
      <h2>Demo cockpit cannot load yet</h2>
      <div class="notice warning-note">${esc(state.error)}</div>
      <div class="grid two" style="margin-top:14px;">
        <label>Admin token<input data-token="admin" value="${esc(state.tokens.admin)}"></label>
        <label>Partner token<input data-token="partner" value="${esc(state.tokens.partner)}"></label>
      </div>
      <div class="actions" style="margin-top:14px;">
        <button data-action="refresh">Retry</button>
      </div>
    </section>
  `;
}

function renderHealthBadge() {
  const ok = Boolean(state.snapshot?.health?.ok);
  return `<span class="badge ${ok ? "ok" : "danger"}">${ok ? "API online" : "API offline"}</span>`;
}

function renderReadyBadge() {
  const ready = Boolean(state.snapshot?.readiness?.ready);
  return `<span class="badge ${ready ? "ok" : "warn"}">${ready ? "ready" : "demo mode"}</span>`;
}

function activeOrder() {
  const orders = state.snapshot?.orders || [];
  if (state.activeOrderId) {
    const found = orders.find((item) => item.order.id === state.activeOrderId);
    if (found) return found;
  }
  return orders[0] || null;
}

function orderById(id) {
  return (state.snapshot?.orders || []).find((item) => item.order.id === id) || null;
}

function selectedPartner() {
  return state.snapshot?.publicConfig?.partners.find((partner) => partner.id === state.selectedPartnerId) || null;
}

function settledLikeCount() {
  return (state.snapshot?.orders || []).filter((item) => ["settlement_pending", "settled"].includes(item.order.status)).length;
}

function isStepDone(current, statuses) {
  if (!current) return false;
  const currentIndex = statusOrder.indexOf(current);
  const stepIndex = Math.max(...statuses.map((status) => statusOrder.indexOf(status)));
  return currentIndex > stepIndex;
}

function statusTone(status) {
  if (["settled", "credited_to_user", "settlement_pending", "usdt_released", "reserve_locked", "approved", "matched"].includes(status)) return "ok";
  if (["compliance_review", "disputed", "refund_pending", "matching_pending", "payment_received"].includes(status)) return "warn";
  if (["failed", "refunded", "expired", "cancelled"].includes(status)) return "danger";
  return "";
}

function routeDescription(path) {
  const descriptions = {
    "/demo": "Один презентационный вход для всех ролей и живого end-to-end сценария.",
    "/demo/live-flow": "Пошаговый сценарий сделки, который можно показывать заказчику прямо на встрече.",
    "/demo/user": "Клиентская часть: заявка, disclosure, реквизиты, reference ID и receipt.",
    "/demo/partner": "Операционный кабинет юрлица: входящие платежи, mismatch, disputes, reserve.",
    "/demo/compliance": "Админский контур: KYC/AML gates, holds, refunds, readiness and decision log.",
    "/demo/treasury": "Резервы, release, settlement batches and finance close.",
    "/demo/audit": "Журнал действий, bank transactions, documents and integration notes.",
    "/demo/readiness": "Список того, что очищено для демо, и что подключается перед production."
  };
  return descriptions[path] || descriptions["/demo"];
}

function navigate(path) {
  state.path = normalizePath(path);
  history.pushState({}, "", state.path);
  render();
}

function normalizePath(path) {
  const clean = path.replace(/\/+$/, "") || "/demo";
  return clean.startsWith("/demo") ? clean : "/demo";
}

function isActive(path) {
  return path === "/demo" ? state.path === "/demo" : state.path.startsWith(path);
}

function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 3200);
}

function money(value, currency = "USD") {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(Number(value || 0));
}

function number(value) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function time(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
