const $ = (selector) => document.querySelector(selector);
const tokenKey = "p2p.adminToken";

async function api(path, options = {}) {
  const token = localStorage.getItem(tokenKey);
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function money(value, currency = "USD") {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(value || 0);
}

async function boot() {
  $("#adminToken").value = localStorage.getItem(tokenKey) || "";
  $("#loginBtn").addEventListener("click", async () => {
    localStorage.setItem(tokenKey, $("#adminToken").value.trim());
    await refresh();
  });
  $("#logoutBtn").addEventListener("click", () => {
    localStorage.removeItem(tokenKey);
    $("#adminContent").style.display = "none";
  });
  $("#refreshBtn").addEventListener("click", refresh);
  $("#settleBtn").addEventListener("click", settleAll);
  $("#legalForm").addEventListener("submit", saveLegalDocument);
  if (localStorage.getItem(tokenKey)) await refresh();
}

async function refresh() {
  try {
    const [dashboard, orders, bank, audit, readiness] = await Promise.all([
    api("/api/admin/dashboard"),
    api("/api/admin/orders"),
    api("/api/admin/bank-transactions"),
    api("/api/admin/audit-log"),
    api("/api/readiness")
    ]);
    $("#adminContent").style.display = "grid";
    renderMetrics(dashboard.metrics);
    renderOrders(orders.orders);
    renderReserves(dashboard.reserves);
    renderBank(bank.bankTransactions);
    renderAudit(audit.auditLog);
    renderReadiness(readiness);
  } catch (error) {
    if (error.message === "Unauthorized") {
      $("#adminContent").style.display = "none";
      return;
    }
    throw error;
  }
}

function renderMetrics(metrics) {
  const items = [
    ["Всего заявок", metrics.orders],
    ["Открытые", metrics.openOrders],
    ["На проверке", metrics.pendingReview],
    ["Оборот fiat", money(metrics.totalFiat)],
    ["Доступно reserve", `${metrics.reserveAvailable.toLocaleString("ru-RU")} USDT`],
    ["Settlement", metrics.settlements]
  ];
  $("#metrics").innerHTML = items.map(([label, value]) => `
    <div class="panel metric">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function renderOrders(rows) {
  if (rows.length === 0) {
    $("#ordersTable").innerHTML = `<div class="empty">Нет заявок. Создай заявку в user app.</div>`;
    return;
  }
  $("#ordersTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Reference</th>
          <th>Model</th>
          <th>Status</th>
          <th>Fiat</th>
          <th>USDT</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(({ order, partner }) => `
          <tr>
            <td class="mono">${order.referenceId}</td>
            <td>${partner.legalName}<br><span class="badge">${order.modelType}</span></td>
            <td><span class="badge ${statusTone(order.status)}">${order.status}</span></td>
            <td>${money(order.fiatAmount, order.fiatCurrency)}</td>
            <td>${order.usdtAmount} ${order.network}</td>
            <td>
              <div class="actions">
                <button data-action="approve" data-id="${order.id}">Approve</button>
                <button class="secondary" data-action="hold" data-id="${order.id}">Hold</button>
                <button class="warning" data-action="refund" data-id="${order.id}">Refund</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  $("#ordersTable").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => orderAction(button.dataset.action, button.dataset.id));
  });
}

function renderReserves(rows) {
  $("#reservesTable").innerHTML = `
    <table>
      <thead><tr><th>Partner</th><th>Network</th><th>Available</th><th>Locked</th><th>Released</th></tr></thead>
      <tbody>
        ${rows.map((reserve) => `
          <tr>
            <td>${reserve.partnerId}</td>
            <td>${reserve.network}</td>
            <td>${reserve.availableBalance.toLocaleString("ru-RU")}</td>
            <td>${reserve.lockedBalance.toLocaleString("ru-RU")}</td>
            <td>${reserve.releasedBalance.toLocaleString("ru-RU")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderBank(rows) {
  if (rows.length === 0) {
    $("#bankTable").innerHTML = `<div class="empty">Bank transaction import пока пуст.</div>`;
    return;
  }
  $("#bankTable").innerHTML = `
    <table>
      <thead><tr><th>Sender</th><th>Reference</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.slice().reverse().map((tx) => `
          <tr>
            <td>${tx.senderName}</td>
            <td class="mono">${tx.paymentReference}</td>
            <td>${money(tx.amount, tx.currency)}</td>
            <td><span class="badge ${tx.status === "matched" ? "ok" : "warn"}">${tx.status}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderAudit(rows) {
  $("#auditBox").innerHTML = `
    <div class="timeline">
      ${rows.slice(0, 10).map((event) => `
        <div class="timeline-item">
          <span>${new Date(event.createdAt).toLocaleTimeString("ru-RU")}</span>
          <strong>${event.action}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

async function orderAction(action, orderId) {
  const path = {
    approve: `/api/admin/orders/${orderId}/approve`,
    hold: `/api/admin/orders/${orderId}/hold`,
    refund: `/api/admin/orders/${orderId}/refund`
  }[action];
  const body = action === "approve"
    ? { manualOverride: true }
    : action === "hold"
      ? { reason: "operator_manual_hold", severity: "medium" }
      : { reason: "operator_refund" };
  try {
    await api(path, { method: "POST", body });
  } catch (error) {
    alert(error.message);
  }
  await refresh();
}

async function settleAll() {
  const config = await api("/api/config");
  for (const partner of config.partners) {
    try {
      await api("/api/admin/settlements/generate", {
        method: "POST",
        body: { partnerId: partner.id, mode: "daily_close" }
      });
    } catch {
      // Some partners may have no ready orders in demo mode.
    }
  }
  await refresh();
}

async function saveLegalDocument(event) {
  event.preventDefault();
  await api("/api/admin/legal-documents", {
    method: "POST",
    body: {
      slug: $("#legalSlug").value,
      title: $("#legalTitle").value,
      version: $("#legalVersion").value,
      status: $("#legalStatus").value,
      content: $("#legalContent").value,
      requiredForOrder: true
    }
  });
  await refresh();
}

function renderReadiness(report) {
  $("#readinessBox").innerHTML = `
    <div class="badge ${report.ready ? "ok" : "warn"}">${report.ready ? "ready" : "needs work"} · ${report.mode}</div>
    <div class="timeline" style="margin-top:12px;">
      ${report.checks.map((check) => `
        <div class="timeline-item">
          <span><span class="badge ${check.pass ? "ok" : "warn"}">${check.pass ? "ok" : "todo"}</span></span>
          <strong>${check.name}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function statusTone(status) {
  if (["settled", "credited_to_user", "settlement_pending"].includes(status)) return "ok";
  if (["compliance_review", "disputed", "refund_pending"].includes(status)) return "warn";
  if (["failed", "refunded", "expired"].includes(status)) return "danger";
  return "";
}

boot().catch((error) => {
  document.body.innerHTML = `<main class="main"><div class="panel">${error.message}</div></main>`;
});
