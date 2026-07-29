const state = {
  config: null,
  quote: null,
  orderId: localStorage.getItem("p2p.activeOrderId")
};

const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function money(value, currency = "USD") {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(value);
}

async function boot() {
  try {
    await api("/api/health");
    $("#health").textContent = "API online";
    $("#health").className = "badge ok";
  } catch {
    $("#health").textContent = "API offline";
    $("#health").className = "badge danger";
  }
  state.config = await api("/api/public/config");
  renderLegalDocs(state.config.legalDocuments);
  $("#quoteBtn").addEventListener("click", quote);
  $("#orderForm").addEventListener("submit", createOrder);
  if (state.orderId) await refreshOrder();
}

function formPayload() {
  return {
    legalName: $("#legalName").value,
    email: $("#email").value,
    phone: $("#phone").value,
    country: $("#country").value,
    modelType: $("#modelType").value,
    fiatAmount: Number($("#fiatAmount").value),
    fiatCurrency: $("#fiatCurrency").value,
    network: $("#network").value,
    acceptedTerms: $("#acceptedTerms").checked
  };
}

async function quote() {
  state.quote = await api("/api/user/orders/quote", {
    method: "POST",
    body: formPayload()
  });
  renderQuote(state.quote);
}

async function createOrder(event) {
  event.preventDefault();
  const result = await api("/api/user/orders", {
    method: "POST",
    body: formPayload()
  });
  state.orderId = result.order.id;
  localStorage.setItem("p2p.activeOrderId", state.orderId);
  renderInstruction(result);
  await refreshOrder();
}

async function refreshOrder() {
  if (!state.orderId) return;
  const data = await api(`/api/user/orders/${state.orderId}`);
  renderInstruction(data);
  renderStatus(data.order);
  renderReceipt(data);
}

function renderQuote(data) {
  const { quote, partner } = data;
  $("#quoteBox").innerHTML = `
    <div class="grid">
      <div class="metric panel" style="box-shadow:none;">
        <span>К получению</span>
        <strong>${quote.usdtAmount} USDT</strong>
      </div>
      <table>
        <tbody>
          <tr><td>Партнер</td><td>${partner.legalName}</td></tr>
          <tr><td>Модель</td><td><span class="badge">${partner.modelType}</span></td></tr>
          <tr><td>Курс</td><td>${quote.exchangeRate}</td></tr>
          <tr><td>Комиссия</td><td>${money(quote.serviceFee, "USD")}</td></tr>
          <tr><td>Network fee</td><td>${money(quote.networkFee, "USD")}</td></tr>
          <tr><td>Действует до</td><td>${new Date(quote.expiresAt).toLocaleString("ru-RU")}</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderLegalDocs(docs = []) {
  if (!docs.length) {
    $("#legalBox").textContent = "Юридические документы еще не загружены. Для production добавьте их в Admin -> Legal documents.";
    return;
  }
  $("#legalBox").innerHTML = `
    <strong>Документы:</strong>
    ${docs.map((doc) => `<a href="/legal?slug=${encodeURIComponent(doc.slug)}" target="_blank" rel="noreferrer">${doc.title} ${doc.version}</a>`).join(" · ")}
  `;
}

function renderInstruction(data) {
  const order = data.order;
  const instruction = data.paymentInstruction;
  if (!order || !instruction) return;
  $("#instructionBox").innerHTML = `
    <div class="notice">${instruction.disclosureText}</div>
    <table style="margin-top:12px;">
      <tbody>
        <tr><td>Получатель</td><td>${instruction.recipientLegalName}</td></tr>
        <tr><td>Банк</td><td>${instruction.bankName}</td></tr>
        <tr><td>Счет</td><td class="mono">${instruction.accountNumberMasked}</td></tr>
        <tr><td>Сумма</td><td>${money(order.fiatAmount, order.fiatCurrency)}</td></tr>
        <tr><td>Reference ID</td><td class="mono"><strong>${instruction.referenceId}</strong></td></tr>
        <tr><td>Назначение</td><td>${instruction.paymentPurpose}</td></tr>
      </tbody>
    </table>
    <div class="actions" style="margin-top:12px;">
      <a href="/partner"><button type="button" class="secondary">Открыть partner flow</button></a>
      <button type="button" class="secondary" id="refreshBtn">Обновить статус</button>
      <button type="button" class="warning" id="disputeBtn">Открыть спор</button>
    </div>
  `;
  $("#refreshBtn").addEventListener("click", refreshOrder);
  $("#disputeBtn").addEventListener("click", openDispute);
}

function renderStatus(order) {
  $("#statusBox").innerHTML = `
    <div class="badge ${statusTone(order.status)}">${order.status}</div>
    <div class="timeline" style="margin-top:12px;">
      ${order.statusHistory.slice().reverse().map((event) => `
        <div class="timeline-item">
          <span>${new Date(event.at).toLocaleTimeString("ru-RU")}</span>
          <strong>${event.to}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderReceipt(data) {
  const order = data.order;
  $("#receiptBox").innerHTML = `
    <table>
      <tbody>
        <tr><td>Order</td><td class="mono">${order.id}</td></tr>
        <tr><td>Status</td><td><span class="badge ${statusTone(order.status)}">${order.status}</span></td></tr>
        <tr><td>Fiat</td><td>${money(order.fiatAmount, order.fiatCurrency)}</td></tr>
        <tr><td>USDT</td><td>${order.usdtAmount} ${order.network}</td></tr>
        <tr><td>Reference</td><td class="mono">${order.referenceId}</td></tr>
      </tbody>
    </table>
  `;
}

async function openDispute() {
  if (!state.orderId) return;
  await api(`/api/user/orders/${state.orderId}/dispute`, {
    method: "POST",
    body: { type: "payment_issue", message: "User opened demo dispute" }
  });
  await refreshOrder();
}

function statusTone(status) {
  if (["settled", "credited_to_user", "settlement_pending"].includes(status)) return "ok";
  if (["compliance_review", "disputed", "refund_pending"].includes(status)) return "warn";
  if (["failed", "refunded", "expired"].includes(status)) return "danger";
  return "";
}

boot().catch((error) => {
  $("#instructionBox").innerHTML = `<div class="empty">${error.message}</div>`;
});
