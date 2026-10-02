const routes = [
  ["overview", "OV", "Обзор"],
  ["flow", "LF", "Сценарий сделки"],
  ["user", "US", "Клиент"],
  ["partner", "PT", "Партнёр"],
  ["compliance", "CO", "Проверка"],
  ["treasury", "TR", "Резервы"],
  ["audit", "AU", "Журнал"]
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
    client: form?.get("client") || "Иван Петров",
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
          <span class="badge ok">Демо</span>
          <span class="badge ${state.order ? "ok" : "warn"}">${state.order?.status || "ready"}</span>
          <p>Учебный контур · данные сохраняются в этом браузере.</p>
          <button class="ghost" data-action="reset">Сбросить</button>
        </div>
      </aside>
      <main class="content">
        ${topline(route)}
        ${page(route)}
<section class="open-context"><div class="reference-heading"><h2>Курсы валют</h2><span>Открытые данные</span></div><p class="source-note">Банк России · 02.10.2026 · справочные значения, не курс сделки</p><div class="reference-grid"><article class="reference-item"><div><strong>1 GBP</strong><p>110.5915 ₽</p><a href="https://www.cbr.ru/scripts/XML_daily.asp" target="_blank" rel="noreferrer">Источник ↗</a></div></article><article class="reference-item"><div><strong>1 USD</strong><p>83.2454 ₽</p><a href="https://www.cbr.ru/scripts/XML_daily.asp" target="_blank" rel="noreferrer">Источник ↗</a></div></article><article class="reference-item"><div><strong>1 EUR</strong><p>94.5252 ₽</p><a href="https://www.cbr.ru/scripts/XML_daily.asp" target="_blank" rel="noreferrer">Источник ↗</a></div></article><article class="reference-item"><div><strong>1 CNY</strong><p>12.4028 ₽</p><a href="https://www.cbr.ru/scripts/XML_daily.asp" target="_blank" rel="noreferrer">Источник ↗</a></div></article></div></section>
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
    overview: ["Рабочая область", "USDT Desk / Обзор операций"],
    flow: ["Сценарий сделки", "Проведите учебную заявку от создания до закрытия расчёта."],
    user: ["Кабинет клиента", "Заявка, инструкции и подтверждение операции."],
    partner: ["Кабинет партнёра", "Подтверждение поступления, расхождения и резерв партнёра."],
    compliance: ["Проверка заявки", "Решения по заявкам и проверка расхождений."],
    treasury: ["Резервы и расчёты", "Остатки, зачисления и закрытие расчётов."],
    audit: ["Журнал действий", "Все действия в демо сохраняются в журнале."]
  };
  const [title, desc] = titles[route] || titles.overview;
  return `<header class="topline"><div><h1>${title}</h1><p>${desc}</p></div><div class="actions"><button data-action="create">Создать заявку</button><button class="secondary" data-action="reset">Сбросить данные</button></div></header>`;
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
        <span class="eyebrow">Операционная панель</span>
        <h2>Заявки и расчёты<br>под контролем.</h2>
        <p>Создайте заявку, подтвердите поступление средств и проведите расчёт. Каждое действие сохраняется в журнале. Учебный контур: реальные переводы не выполняются.</p>
        <div class="actions"><button data-action="create">Создать заявку</button><a class="button ghost" href="#/flow">Открыть сценарий</a></div>
      </div>
      <div class="role-picker">
        ${role("user", "Клиент", "Пользователь", "Заявка, условия, назначение и подтверждение.")}
        ${role("partner", "Партнёр", "Юрлицо-партнер", "Поступление средств, расхождения и резерв.")}
        ${role("compliance", "Админ", "Проверка и контроль", "Согласование и проверка расхождений.")}
        ${role("treasury", "Финансы", "Резервы", "Остатки, зачисления и итоговый расчёт.")}
        ${role("flow", "Обзор", "Полный сценарий", "Все этапы до завершения расчёта.")}
      </div>
    </section>
    <section class="grid four">
      ${metric("Заявки", state.order ? 1 : 0, state.order?.reference || "пока нет")}
      ${metric("Объём заявок", money(state.order?.fiat || 0), "учебные операции")}
      ${metric("Резерв", `${num(state.reserve.available)} USDT`, "доступно")}
      ${metric("Расчёты", state.settlements.length, "сформировано")}
    </section>
  `;
}

function liveFlow() {
  return `
    <section class="panel">
      <h2>Этапы сделки</h2>
      ${flowBoard()}
      <div class="actions" style="margin-top:14px;">
        <button data-action="create">1. Создать заявку</button>
        <button class="secondary" data-action="confirm">2. Подтвердить поступление</button>
        <button class="secondary" data-action="approve">3. Согласовать и зачислить</button>
        <button class="secondary" data-action="settle">4. Сформировать расчёт</button>
        <button class="warning" data-action="wrong">Проверить расхождение</button>
      </div>
    </section>
    <section class="split">
      <section class="panel"><h2>Текущая заявка</h2>${state.order ? ticket() : empty("Создайте заявку, чтобы начать.")}</section>
      <section class="panel"><h2>История этапов</h2>${state.order ? timeline(state.order.history) : empty("История появится после создания заявки.")}</section>
    </section>
  `;
}

function userView() {
  return `
    <section class="split">
      <form id="orderForm" class="panel">
        <h2>Новая заявка</h2>
        <div class="form-grid">
          <label>Имя клиента<input name="client" value="${state.order?.client || "Иван Петров"}"></label>
          <label>Сумма<input name="amount" type="number" value="${state.order?.fiat || 1250}"></label>
          <label>Модель<select name="model"><option value="agent">агент / приём средств</option><option value="merchant">мерчант / поставщик ликвидности</option></select></label>
          <label>Сеть<select name="network"><option>TRC20</option><option>ERC20</option><option>BEP20</option></select></label>
        </div>
        <div class="actions" style="margin-top:14px;"><button>Создать заявку</button></div>
      </form>
      <aside class="grid">
        <section class="panel"><h2>Инструкции по оплате</h2>${state.order ? instructions() : empty("Создайте заявку, чтобы увидеть учебные реквизиты.")}</section>
        <section class="panel"><h2>Подтверждение</h2>${state.order ? receipt() : empty("Подтверждение появится после создания заявки.")}</section>
      </aside>
    </section>
  `;
}

function partnerView() {
  return `
    <section class="split">
      <section class="panel"><h2>Заявки партнёра</h2>${state.order ? partnerTable() : empty("Входящих заявок пока нет.")}</section>
      <aside class="grid">
        <section class="panel"><h2>Резерв</h2>${reserveTable()}<div class="actions" style="margin-top:12px;"><button class="secondary" data-action="confirm">Подтвердить точную сумму</button><button class="warning" data-action="wrong">Сумма не совпадает</button></div></section>
        <section class="panel"><h2>Памятка партнёра</h2>${rail("MATCH", "Проверка назначения", "До зачисления должны совпасть сумма, отправитель и назначение.")}${rail("REVIEW", "Расхождение в платеже", "Если сумма не совпадает, заявка направляется на ручную проверку.")}</section>
      </aside>
    </section>
  `;
}

function complianceView() {
  return `
    <section class="grid four">
      ${metric("Риск", riskLabel(), "учебная проверка")}
      ${metric("События журнала", state.audit.length, "записано")}
      ${metric("Текущий этап", state.order?.status || "none", "цикл заявки")}
      ${metric("Контур", "Демо", "провайдеры не подключены")}
    </section>
    <section class="split">
      <section class="panel"><h2>Очередь проверки</h2>${state.order ? adminTable() : empty("Заявок пока нет.")}</section>
      <aside class="panel"><h2>Порядок проверки</h2>${rail("KYC", "Отправитель", "Имя клиента должно совпадать с отправителем.")}${rail("AML", "Платёж", "Расхождения направляются на проверку.")}${rail("OPS", "Решение", "Согласование зачисляет средства и сохраняет событие в журнале.")}</aside>
    </section>
  `;
}

function treasuryView() {
  return `
    <section class="grid three">
      ${metric("Доступный резерв", `${num(state.reserve.available)} USDT`, "общий остаток")}
      ${metric("Зачислено", `${num(state.reserve.released)} USDT`, "учебный реестр")}
      ${metric("Расчёты", state.settlements.length, "пакетов")}
    </section>
    <section class="split">
      <section class="panel"><h2>Состояние резервов</h2>${reserveTable()}</section>
      <section class="panel"><h2>Пакеты расчётов</h2>${settlementTable()}<div class="actions" style="margin-top:12px;"><button data-action="settle">Сформировать расчёт</button></div></section>
    </section>
  `;
}

function auditView() {
  return `<section class="split"><section class="panel"><h2>Журнал действий</h2>${timeline(state.audit.map((item) => ({ at: item.at, actor: item.actor, to: item.action })))}</section><aside class="panel"><h2>Исходный проект</h2>${rail("CODE", "Исходники сервера", "В репозитории есть сервер, защищённые API и приложения ролей.")}${rail("PAGES", "Демонстрация", "Эта версия работает локально в браузере без реальных переводов.")}</aside></section>`;
}

function role(id, code, title, text) {
  return `<a class="role-option" href="#/${id}"><span>${code}</span><strong>${title}</strong><small>${text}</small></a>`;
}

function flowBoard() {
  const current = state.order?.status || "";
  const steps = [
    ["Заявка", "Создано назначение.", ["awaiting_payment"]],
    ["Поступление", "Партнёр подтверждает платёж.", ["payment_received"]],
    ["Сопоставление", "Проверены сумма и отправитель.", ["matched"]],
    ["Проверка", "Решение по риску.", ["approved"]],
    ["Зачисление", "Учебное зачисление USDT.", ["reserve_locked", "credited_to_user", "settlement_pending"]],
    ["Расчёт", "Закрыт итоговый расчёт.", ["settled"]]
  ];
  return `<div class="flow-board">${steps.map(([title, text, statuses], index) => {
    const active = statuses.includes(current);
    const done = statusOrder.indexOf(current) > Math.max(...statuses.map((item) => statusOrder.indexOf(item)));
    return `<div class="flow-step ${active ? "active" : ""} ${done ? "done" : ""}"><span class="badge ${active ? "ok" : done ? "info" : ""}">${String(index + 1).padStart(2, "0")}</span><strong>${title}</strong><span>${text}</span></div>`;
  }).join("")}</div>`;
}

function ticket() {
  const order = state.order;
  return `<div class="ticket"><div class="ticket-head"><div><strong class="mono">${order.reference}</strong><span class="badge ${tone(order.status)}">${order.status}</span></div><div class="actions"><button class="secondary" data-action="confirm">Подтвердить</button><button class="secondary" data-action="approve">Согласовать</button><button class="warning" data-action="settle">Закрыть расчёт</button></div></div>${orderTable()}</div>`;
}

function orderTable() {
  const o = state.order;
  return `<table><tbody><tr><td>Клиент</td><td>${escapeText(o.client)}</td></tr><tr><td>Партнёр</td><td>${o.partner} <span class="badge">${o.model}</span></td></tr><tr><td>Сумма</td><td>${money(o.fiat)}</td></tr><tr><td>USDT</td><td>${num(o.usdt)} ${o.network}</td></tr></tbody></table>`;
}

function instructions() {
  const o = state.order;
  return `<div class="notice">Учебный платёж принимает ${o.partner} по заявке ${o.reference}. Сохраните назначение без изменений.</div><table style="margin-top:12px;"><tbody><tr><td>Получатель</td><td>${o.partner}</td></tr><tr><td>Банк</td><td>Учебный банк</td></tr><tr><td>Счёт</td><td class="mono">AE00 **** **** 1001</td></tr><tr><td>Назначение</td><td class="mono"><strong>${o.reference}</strong></td></tr></tbody></table>`;
}

function receipt() {
  return `<table><tbody><tr><td>Статус</td><td><span class="badge ${tone(state.order.status)}">${state.order.status}</span></td></tr><tr><td>Сумма</td><td>${money(state.order.fiat)}</td></tr><tr><td>USDT</td><td>${num(state.order.usdt)} ${state.order.network}</td></tr><tr><td>Назначение</td><td class="mono">${state.order.reference}</td></tr></tbody></table>`;
}

function partnerTable() {
  return `<table><thead><tr><th>Назначение</th><th>Статус</th><th>Сумма</th><th>Действия</th></tr></thead><tbody><tr><td class="mono">${state.order.reference}</td><td><span class="badge ${tone(state.order.status)}">${state.order.status}</span></td><td>${money(state.order.fiat)}<br>${num(state.order.usdt)} USDT</td><td><div class="actions"><button data-action="confirm">Точная сумма</button><button class="warning" data-action="wrong">Расхождение</button></div></td></tr></tbody></table>`;
}

function adminTable() {
  return `<table><thead><tr><th>Назначение</th><th>Статус</th><th>Риск</th><th>Действие</th></tr></thead><tbody><tr><td class="mono">${state.order.reference}</td><td><span class="badge ${tone(state.order.status)}">${state.order.status}</span></td><td><span class="badge ${state.order.status === "compliance_review" ? "warn" : "ok"}">${riskLabel()}</span></td><td><button data-action="approve">Согласовать и зачислить</button></td></tr></tbody></table>`;
}

function reserveTable() {
  return `<table><thead><tr><th>Сеть</th><th>Доступно</th><th>Зачислено</th></tr></thead><tbody><tr><td>TRC20</td><td>${num(state.reserve.available)}</td><td>${num(state.reserve.released)}</td></tr></tbody></table>`;
}

function settlementTable() {
  if (!state.settlements.length) return empty("Пакетов расчёта пока нет.");
  return `<table><thead><tr><th>Пакет</th><th>Заявки</th><th>Сумма</th><th>USDT</th></tr></thead><tbody>${state.settlements.map((s) => `<tr><td class="mono">${s.id}</td><td>${s.orders}</td><td>${money(s.fiat)}</td><td>${num(s.usdt)}</td></tr>`).join("")}</tbody></table>`;
}

function timeline(items) {
  if (!items.length) return empty("Событий пока нет.");
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
  return state.order.status === "compliance_review" ? "ручная проверка" : "расхождений нет";
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
