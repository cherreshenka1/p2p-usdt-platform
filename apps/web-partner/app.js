const $ = (selector) => document.querySelector(selector);
const tokenKey = "p2p.partnerToken";

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
  $("#partnerToken").value = localStorage.getItem(tokenKey) || "";
  $("#loginBtn").addEventListener("click", async () => {
    localStorage.setItem(tokenKey, $("#partnerToken").value.trim());
    await refresh();
  });
  $("#logoutBtn").addEventListener("click", () => {
    localStorage.removeItem(tokenKey);
    $("#partnerContent").style.display = "none";
  });
  const config = await api("/api/public/config");
  $("#partnerId").innerHTML = config.partners.map((partner) => (
    `<option value="${partner.id}">${partner.legalName} (${partner.modelType})</option>`
  )).join("");
  $("#partnerId").addEventListener("change", refresh);
  if (localStorage.getItem(tokenKey)) await refresh();
}

async function refresh() {
  const partnerId = $("#partnerId").value;
  try {
    const [orders, reserve, settlements, disputes] = await Promise.all([
    api(`/api/partner/orders?partnerId=${partnerId}`),
    api(`/api/partner/reserve?partnerId=${partnerId}`),
    api(`/api/partner/settlements?partnerId=${partnerId}`),
    api(`/api/partner/disputes?partnerId=${partnerId}`)
    ]);
    $("#partnerContent").style.display = "block";
    renderOrders(orders.orders);
    renderReserve(reserve.reserves);
    renderSettlements(settlements.settlements);
    renderDisputes(disputes.disputes);
  } catch (error) {
    if (error.message === "Unauthorized") {
      $("#partnerContent").style.display = "none";
      return;
    }
    throw error;
  }
}

function renderOrders(rows) {
  if (rows.length === 0) {
    $("#ordersBox").innerHTML = `<div class="empty">Нет заявок для выбранного партнера.</div>`;
    return;
  }
  $("#ordersBox").innerHTML = `
    <table>
      <thead>
        <tr><th>Reference</th><th>Status</th><th>Amount</th><th></th></tr>
      </thead>
      <tbody>
        ${rows.map(({ order, kycProfile }) => `
          <tr>
            <td class="mono">${order.referenceId}</td>
            <td><span class="badge ${statusTone(order.status)}">${order.status}</span></td>
            <td>${money(order.fiatAmount, order.fiatCurrency)}<br>${order.usdtAmount} USDT</td>
            <td>
              <div class="actions">
                <button data-action="confirm" data-id="${order.id}" data-sender="${kycProfile?.legalName || ""}">Confirm</button>
                <button class="secondary" data-action="wrong" data-id="${order.id}" data-sender="${kycProfile?.legalName || ""}">Wrong amount</button>
                <button class="warning" data-action="third" data-id="${order.id}">Third party</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  $("#ordersBox").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => confirmPayment(button.dataset));
  });
}

function renderReserve(rows) {
  $("#reserveBox").innerHTML = `
    <table>
      <thead><tr><th>Network</th><th>Available</th><th>Locked</th><th>Released</th></tr></thead>
      <tbody>
        ${rows.map((reserve) => `
          <tr>
            <td>${reserve.network}</td>
            <td>${reserve.availableBalance.toLocaleString("ru-RU")}</td>
            <td>${reserve.lockedBalance.toLocaleString("ru-RU")}</td>
            <td>${reserve.releasedBalance.toLocaleString("ru-RU")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div class="actions" style="margin-top:12px;">
      <button id="topUpBtn" class="secondary">Top-up 1000 USDT</button>
    </div>
  `;
  $("#topUpBtn").addEventListener("click", topUp);
}

function renderSettlements(rows) {
  if (rows.length === 0) {
    $("#settlementsBox").innerHTML = `<div class="empty">Расчетных пакетов пока нет.</div>`;
    return;
  }
  $("#settlementsBox").innerHTML = `
    <table>
      <thead><tr><th>ID</th><th>Orders</th><th>Fiat</th><th>USDT</th></tr></thead>
      <tbody>
        ${rows.slice().reverse().map((batch) => `
          <tr>
            <td class="mono">${batch.id}</td>
            <td>${batch.orderCount}</td>
            <td>${money(batch.totalFiat)}</td>
            <td>${batch.totalUsdt}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderDisputes(rows) {
  if (rows.length === 0) {
    $("#disputesBox").innerHTML = `<div class="empty">Нет открытых disputes.</div>`;
    return;
  }
  $("#disputesBox").innerHTML = `
    <div class="timeline">
      ${rows.map((item) => `
        <div class="timeline-item">
          <span>${item.status}</span>
          <strong>${item.type}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

async function confirmPayment(dataset) {
  const body = {};
  if (dataset.action === "wrong") body.amount = 777;
  if (dataset.action === "third") body.senderName = "Third Party Sender";
  if (dataset.action === "confirm") body.senderName = dataset.sender;
  try {
    await api(`/api/partner/orders/${dataset.id}/confirm-payment`, {
      method: "POST",
      body
    });
  } catch (error) {
    alert(error.message);
  }
  await refresh();
}

async function topUp() {
  await api("/api/partner/reserve/top-up", {
    method: "POST",
    body: { partnerId: $("#partnerId").value, network: "TRC20", amount: 1000 }
  });
  await refresh();
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
