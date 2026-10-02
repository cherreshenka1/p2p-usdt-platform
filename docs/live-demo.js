const routes = [
  ["overview", "OV", "Overview"],
  ["flow", "LF", "Live flow"],
  ["user", "US", "User"],
  ["partner", "PT", "Partner"],
  ["compliance", "CO", "Compliance"],
  ["treasury", "TR", "Treasury"],
  ["audit", "AU", "Audit"]
];

const statusOrder = ["awaiting_payment", "payment_received", "matched", "approved", "reserve_locked", "credited_to_user", "settlement_pending", "settled"];
const app = document.querySelector("#app");

const state = loadState();

window.addEventListener("hashchange", render);
document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  event.preventDefault();
  actions[action]?.();
});
document.addEventListener("submit", (event) => {
  if (event.target.id !== "orderForm") return;
  event.preventDefault();
  createOrder(new FormData(event.target));
});

render();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("usdtDeskLiveDemo"));
    if (saved && saved.reserve && Array.isArray(saved.audit) && Array.isArray(saved.settlements) && (!saved.order || Array.isArray(saved.order.history))) return saved;
  } catch { /* Recover malformed browser data. */ }
  return freshState();
}

function freshState() {
  return {
    order: null,
    reserve: { available: 75000, locked: 0, released: 0 },
    settlements: [],
    audit: [{ at: now(), actor: "system", action: "demo.loaded" }]
  };
}

function save() {
  try { localStorage.setItem("usdtDeskLiveDemo", JSON.stringify(state)); } catch { /* Keep session usable if storage is unavailable. */ }
}

const actions = {
  reset() {
    Object.assign(state, freshState());
    save();
    render();
  },
  create() {
    createOrder();
  },
  confirm() {
    if (!state.order || state.order.status !== "awaiting_payment") return;
    move("payment_received", "partner", "payment.confirmed");
    move("matched", "matching", "payment.matched");
  },
  wrong() {
    if (!state.order || state.order.status !== "awaiting_payment") return;
    move("payment_received", "partner", "payment.confirmed_wrong_amount");
    move("compliance_review", "matching", "payment.review_required");
  },
  approve() {
    if (!state.order || !["matched", "compliance_review"].includes(state.order.status)) return;
    if (state.reserve.available < state.order.usdt) return;
    move("approved", "admin", "order.approved");
    move("reserve_locked", "ledger", "reserve.locked");
    state.reserve.available = round(state.reserve.available - state.order.usdt);
    state.reserve.released = round(state.reserve.released + state.order.usdt);
    move("credited_to_user", "ledger", "usdt.released");
    move("settlement_pending", "finance", "settlement.pending");
  },
  settle() {
    if (!state.order || !["settlement_pending", "credited_to_user"].includes(state.order.status)) return;
    if (state.order.status === "settled") return;
    const batch = {
      id: `SET-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
      orders: 1,
      fiat: state.order.fiat,
      usdt: state.order.usdt,
      at: now()
    };
    state.settlements.unshift(batch);
    move("settled", "finance", "settlement.generated");
  }
};

function createOrder(form = null) {
  const amount = Number(form?.get("amount") || 1250);
  if (!Number.isFinite(amount) || amount < 10 || amount > 50000) return;
  if (state.order && state.order.status !== "settled") return;
  const model = form?.get("model") === "merchant" ? "merchant" : "agent";
  const network = form?.get("network") || "TRC20";
  const spread = model === "merchant" ? 0.012 : 0.008;
  const usdt = round(amount * (1 - spread) - 2.5);
  state.order = {
    id: `ORD-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
    reference: `${model === "merchant" ? "MER" : "AGT"}-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
    model,
    network,
    fiat: amount,
    usdt,
    client: form?.get("client") || "Ivan Petrov",
    partner: model === "merchant" ? "ABC Trading FZE" : "ABC Payments FZE",
    status: "awaiting_payment",
    history: [{ at: now(), actor: "system", from: null, to: "awaiting_payment" }]
  };
  state.audit.unshift({ at: now(), actor: "user", action: "order.created" });
  save();
  location.hash = "#/flow";
  render();
}

function move(next, actor, action) {
  const previous = state.order.status;
  if (previous !== next) {
    state.order.status = next;
    state.order.history.unshift({ at: now(), actor, from: previous, to: next });
  }
  state.audit.unshift({ at: now(), actor, action });
  save();
  render();
}

function render() {
  const route = currentRoute();
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="mark">UD</div>
          <strong>USDT Desk</strong>
          <span>Демо · без реальных переводов</span>
        </div>
        <nav class="nav">
          ${routes.map(([id, code, label]) => `<a class="${route === id ? "active" : ""}" href="#/${id}"><span>${code}</span><strong>${label}</strong></a>`).join("")}
        </nav>
        <div class="side">
          <span class="badge ok">Live link</span>
          <span class="badge ${state.order ? "ok" : "warn"}">${state.order?.status || "ready"}</span>
          <p>This hosted preview runs fully in the browser. The GitHub repo also contains the full Node API version.</p>
          <button class="ghost" data-action="reset">Reset demo</button>
        </div>
      </aside>
      <main class="content">
        ${topline(route)}
        ${page(route)}
      </main>
    </div>
  `;
  const current = state.order?.status;
  const allowed = {
    create: !state.order || current === 'settled',
    confirm: current === 'awaiting_payment',
    wrong: current === 'awaiting_payment',
    approve: ['matched', 'compliance_review'].includes(current) && state.reserve.available >= state.order.usdt,
    settle: ['settlement_pending', 'credited_to_user'].includes(current)
  };
  app.querySelectorAll('button[data-action]').forEach(button => {
    if (Object.hasOwn(allowed, button.dataset.action)) {
      button.disabled = !allowed[button.dataset.action];
      if (button.disabled) button.title = 'Недоступно на текущем этапе заявки';
    }
  });
}

function currentRoute() {
  return (location.hash.replace("#/", "") || "overview").split("/")[0];
}

function topline(route) {
  const titles = {
    overview: ["Choose role", "One live link. Pick who you want to be: client, partner, admin, treasury or observer."],
    flow: ["Live flow", "Click through the full fiat to USDT lifecycle."],
    user: ["User view", "Client order form, payment instructions and receipt."],
    partner: ["Partner view", "Fiat confirmation, mismatch and partner reserve."],
    compliance: ["Compliance view", "Approve, review and risk controls."],
    treasury: ["Treasury view", "Reserve, release and settlement close."],
    audit: ["Audit room", "Every demo action leaves an audit event."]
  };
  const [title, desc] = titles[route] || titles.overview;
  return `<header class="topline"><div><h1>${title}</h1><p>${desc}</p></div><div class="actions"><button data-action="create">Create order</button><button class="secondary" data-action="reset">Clean demo</button></div></header>`;
}

function page(route) {
  if (route === "flow") return liveFlow();
  if (route === "user") return userView();
  if (route === "partner") return partnerView();
  if (route === "compliance") return complianceView();
  if (route === "treasury") return treasuryView();
  if (route === "audit") return auditView();
  return overview();
}

function overview() {
  return `
    <section class="hero">
      <div class="hero-body">
        <span class="eyebrow">One hosted link</span>
        <h2>Выберите, за кого смотреть приложение.</h2>
        <p>Это живая GitHub Pages ссылка для презентации. Она показывает роли, lifecycle сделки, reserve, settlement и audit без локального запуска.</p>
        <div class="actions"><button data-action="create">Create live order</button><a class="button ghost" href="#/flow">Watch full flow</a></div>
      </div>
      <div class="role-picker">
        ${role("user", "Client", "Пользователь", "Заявка, disclosure, reference ID и receipt.")}
        ${role("partner", "Partner", "Юрлицо-партнер", "Подтверждение фиата, mismatch, reserve.")}
        ${role("compliance", "Admin", "Compliance / Admin", "Approve, hold, risk review.")}
        ${role("treasury", "Finance", "Treasury", "Reserve, release, settlement close.")}
        ${role("flow", "Observer", "Полный сценарий", "Пошаговый показ сделки до settled.")}
      </div>
    </section>
    <section class="grid four">
      ${metric("Orders", state.order ? 1 : 0, state.order?.reference || "not created")}
      ${metric("Fiat volume", money(state.order?.fiat || 0), "browser demo")}
      ${metric("Reserve", `${num(state.reserve.available)} USDT`, "available")}
      ${metric("Settlements", state.settlements.length, "generated")}
    </section>
  `;
}

function liveFlow() {
  return `
    <section class="panel">
      <h2>Presentation script</h2>
      ${flowBoard()}
      <div class="actions" style="margin-top:14px;">
        <button data-action="create">1. User creates order</button>
        <button class="secondary" data-action="confirm">2. Partner confirms fiat</button>
        <button class="secondary" data-action="approve">3. Admin approves + releases</button>
        <button class="secondary" data-action="settle">4. Generate settlement</button>
        <button class="warning" data-action="wrong">Wrong amount branch</button>
      </div>
    </section>
    <section class="split">
      <section class="panel"><h2>Active order</h2>${state.order ? ticket() : empty("Create an order to begin.")}</section>
      <section class="panel"><h2>Status timeline</h2>${state.order ? timeline(state.order.history) : empty("No timeline yet.")}</section>
    </section>
  `;
}

function userView() {
  return `
    <section class="split">
      <form id="orderForm" class="panel">
        <h2>New USDT order</h2>
        <div class="form-grid">
          <label>Client name<input name="client" value="${state.order?.client || "Ivan Petrov"}"></label>
          <label>Amount<input name="amount" type="number" value="${state.order?.fiat || 1250}"></label>
          <label>Model<select name="model"><option value="agent">agent / collecting partner</option><option value="merchant">merchant / liquidity provider</option></select></label>
          <label>Network<select name="network"><option>TRC20</option><option>ERC20</option><option>BEP20</option></select></label>
        </div>
        <div class="actions" style="margin-top:14px;"><button>Create order</button></div>
      </form>
      <aside class="grid">
        <section class="panel"><h2>Payment instructions</h2>${state.order ? instructions() : empty("Create order to get bank details.")}</section>
        <section class="panel"><h2>Receipt</h2>${state.order ? receipt() : empty("Receipt appears after order creation.")}</section>
      </aside>
    </section>
  `;
}

function partnerView() {
  return `
    <section class="split">
      <section class="panel"><h2>Partner order queue</h2>${state.order ? partnerTable() : empty("No incoming orders yet.")}</section>
      <aside class="grid">
        <section class="panel"><h2>Reserve</h2>${reserveTable()}<div class="actions" style="margin-top:12px;"><button class="secondary" data-action="confirm">Confirm exact payment</button><button class="warning" data-action="wrong">Wrong amount</button></div></section>
        <section class="panel"><h2>Partner notes</h2>${rail("MATCH", "Exact reference", "Amount, sender and reference should match before release.")}${rail("REVIEW", "Mismatch branch", "Wrong amount creates a review case instead of silent payout.")}</section>
      </aside>
    </section>
  `;
}

function complianceView() {
  return `
    <section class="grid four">
      ${metric("Risk status", riskLabel(), "KYC/AML demo")}
      ${metric("Audit events", state.audit.length, "recorded")}
      ${metric("Current status", state.order?.status || "none", "order lifecycle")}
      ${metric("Readiness", "Demo", "production needs providers")}
    </section>
    <section class="split">
      <section class="panel"><h2>Admin order queue</h2>${state.order ? adminTable() : empty("No order yet.")}</section>
      <aside class="panel"><h2>Compliance playbook</h2>${rail("KYC", "Identity gate", "Client name should match sender.")}${rail("AML", "Transaction gate", "Mismatches move to review.")}${rail("OPS", "Decision gate", "Approve releases reserve and creates audit evidence.")}</aside>
    </section>
  `;
}

function treasuryView() {
  return `
    <section class="grid three">
      ${metric("Available reserve", `${num(state.reserve.available)} USDT`, "across partners")}
      ${metric("Released", `${num(state.reserve.released)} USDT`, "demo ledger")}
      ${metric("Settlements", state.settlements.length, "batches")}
    </section>
    <section class="split">
      <section class="panel"><h2>Reserve inventory</h2>${reserveTable()}</section>
      <section class="panel"><h2>Settlement batches</h2>${settlementTable()}<div class="actions" style="margin-top:12px;"><button data-action="settle">Generate settlement</button></div></section>
    </section>
  `;
}

function auditView() {
  return `<section class="split"><section class="panel"><h2>Audit trail</h2>${timeline(state.audit.map((item) => ({ at: item.at, actor: item.actor, to: item.action })))}</section><aside class="panel"><h2>Repository package</h2>${rail("CODE", "Full Node API", "The repo contains the backend server, protected APIs and role apps.")}${rail("PAGES", "Live preview", "This GitHub Pages version is a browser demo for client presentations.")}</aside></section>`;
}

function role(id, code, title, text) {
  return `<a class="role-option" href="#/${id}"><span>${code}</span><strong>${title}</strong><small>${text}</small></a>`;
}

function flowBoard() {
  const current = state.order?.status || "";
  const steps = [
    ["User order", "Reference ID issued.", ["awaiting_payment"]],
    ["Fiat received", "Partner confirms bank payment.", ["payment_received"]],
    ["Payment match", "Amount and sender checked.", ["matched"]],
    ["Compliance", "Admin risk decision.", ["approved"]],
    ["Reserve release", "USDT released to user.", ["reserve_locked", "credited_to_user", "settlement_pending"]],
    ["Settlement", "Finance closes batch.", ["settled"]]
  ];
  return `<div class="flow-board">${steps.map(([title, text, statuses], index) => {
    const active = statuses.includes(current);
    const done = statusOrder.indexOf(current) > Math.max(...statuses.map((item) => statusOrder.indexOf(item)));
    return `<div class="flow-step ${active ? "active" : ""} ${done ? "done" : ""}"><span class="badge ${active ? "ok" : done ? "info" : ""}">${String(index + 1).padStart(2, "0")}</span><strong>${title}</strong><span>${text}</span></div>`;
  }).join("")}</div>`;
}

function ticket() {
  const order = state.order;
  return `<div class="ticket"><div class="ticket-head"><div><strong class="mono">${order.reference}</strong><span class="badge ${tone(order.status)}">${order.status}</span></div><div class="actions"><button class="secondary" data-action="confirm">Confirm</button><button class="secondary" data-action="approve">Approve</button><button class="warning" data-action="settle">Settle</button></div></div>${orderTable()}</div>`;
}

function orderTable() {
  const o = state.order;
  return `<table><tbody><tr><td>Client</td><td>${escapeText(o.client)}</td></tr><tr><td>Partner</td><td>${o.partner} <span class="badge">${o.model}</span></td></tr><tr><td>Fiat</td><td>${money(o.fiat)}</td></tr><tr><td>USDT</td><td>${num(o.usdt)} ${o.network}</td></tr></tbody></table>`;
}

function instructions() {
  const o = state.order;
  return `<div class="notice">Fiat payment is accepted by ${o.partner} for order ${o.reference}. Keep the reference unchanged.</div><table style="margin-top:12px;"><tbody><tr><td>Recipient</td><td>${o.partner}</td></tr><tr><td>Bank</td><td>Demo Bank</td></tr><tr><td>Account</td><td class="mono">AE00 **** **** 1001</td></tr><tr><td>Reference</td><td class="mono"><strong>${o.reference}</strong></td></tr></tbody></table>`;
}

function receipt() {
  return `<table><tbody><tr><td>Status</td><td><span class="badge ${tone(state.order.status)}">${state.order.status}</span></td></tr><tr><td>Fiat</td><td>${money(state.order.fiat)}</td></tr><tr><td>USDT</td><td>${num(state.order.usdt)} ${state.order.network}</td></tr><tr><td>Reference</td><td class="mono">${state.order.reference}</td></tr></tbody></table>`;
}

function partnerTable() {
  return `<table><thead><tr><th>Reference</th><th>Status</th><th>Amount</th><th>Actions</th></tr></thead><tbody><tr><td class="mono">${state.order.reference}</td><td><span class="badge ${tone(state.order.status)}">${state.order.status}</span></td><td>${money(state.order.fiat)}<br>${num(state.order.usdt)} USDT</td><td><div class="actions"><button data-action="confirm">Exact</button><button class="warning" data-action="wrong">Wrong</button></div></td></tr></tbody></table>`;
}

function adminTable() {
  return `<table><thead><tr><th>Reference</th><th>Status</th><th>Risk</th><th>Action</th></tr></thead><tbody><tr><td class="mono">${state.order.reference}</td><td><span class="badge ${tone(state.order.status)}">${state.order.status}</span></td><td><span class="badge ${state.order.status === "compliance_review" ? "warn" : "ok"}">${riskLabel()}</span></td><td><button data-action="approve">Approve + release</button></td></tr></tbody></table>`;
}

function reserveTable() {
  return `<table><thead><tr><th>Network</th><th>Available</th><th>Released</th></tr></thead><tbody><tr><td>TRC20</td><td>${num(state.reserve.available)}</td><td>${num(state.reserve.released)}</td></tr></tbody></table>`;
}

function settlementTable() {
  if (!state.settlements.length) return empty("No settlement batches yet.");
  return `<table><thead><tr><th>Batch</th><th>Orders</th><th>Fiat</th><th>USDT</th></tr></thead><tbody>${state.settlements.map((s) => `<tr><td class="mono">${s.id}</td><td>${s.orders}</td><td>${money(s.fiat)}</td><td>${num(s.usdt)}</td></tr>`).join("")}</tbody></table>`;
}

function timeline(items) {
  if (!items.length) return empty("No events yet.");
  return `<div class="timeline">${items.map((item) => `<div class="timeline-item"><span>${new Date(item.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}<br>${item.actor}</span><strong>${item.from ? `${item.from} -> ` : ""}${item.to}</strong></div>`).join("")}</div>`;
}

function metric(label, value, detail) {
  return `<section class="panel metric"><span>${label}</span><strong>${value}</strong><small>${detail}</small></section>`;
}

function rail(code, title, text) {
  return `<div class="rail-item"><b>${code}</b><div><strong>${title}</strong><p>${text}</p></div></div>`;
}

function empty(text) {
  return `<div class="empty">${text}</div>`;
}

function riskLabel() {
  if (!state.order) return "none";
  return state.order.status === "compliance_review" ? "manual review" : "clear";
}

function tone(status) {
  if (["matched", "approved", "reserve_locked", "credited_to_user", "settlement_pending", "settled"].includes(status)) return "ok";
  if (["payment_received", "compliance_review"].includes(status)) return "warn";
  return "";
}

function money(value) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function num(value) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function now() {
  return new Date().toISOString();
}

function escapeText(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
