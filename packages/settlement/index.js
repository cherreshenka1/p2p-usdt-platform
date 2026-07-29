import { makeId, nowIso, OrderStatus, roundMoney, transitionOrder } from "../domain/index.js";

export function generateSettlementBatch(db, { partnerId, mode = "daily_close", actor = "system" }) {
  const orders = db.orders.filter((order) => (
    order.partnerId === partnerId &&
    [OrderStatus.SETTLEMENT_PENDING, OrderStatus.CREDITED_TO_USER].includes(order.status)
  ));
  if (orders.length === 0) {
    throw new Error("No orders ready for settlement");
  }

  const batchId = makeId("set");
  const items = orders.map((order) => ({
    id: makeId("setitem"),
    settlementBatchId: batchId,
    orderId: order.id,
    fiatAmount: order.fiatAmount,
    fiatCurrency: order.fiatCurrency,
    usdtAmount: order.usdtAmount,
    serviceFee: order.serviceFee,
    spreadRate: order.spreadRate,
    networkFee: order.networkFee,
    adjustment: 0,
    status: "included"
  }));

  const totalFiat = roundMoney(items.reduce((sum, item) => sum + item.fiatAmount, 0));
  const totalUsdt = roundMoney(items.reduce((sum, item) => sum + item.usdtAmount, 0));
  const totalFees = roundMoney(items.reduce((sum, item) => sum + item.serviceFee + item.networkFee, 0));
  const batch = {
    id: batchId,
    partnerId,
    mode,
    periodStart: orders[0].createdAt,
    periodEnd: nowIso(),
    status: "generated",
    orderCount: orders.length,
    totalFiat,
    totalUsdt,
    totalFees,
    discrepancyAmount: 0,
    reportUrl: `/api/admin/settlements/${batchId}/csv`,
    createdAt: nowIso()
  };

  for (const order of orders) {
    if (order.status === OrderStatus.CREDITED_TO_USER) {
      transitionOrder(order, OrderStatus.SETTLEMENT_PENDING, actor);
    }
    transitionOrder(order, OrderStatus.SETTLED, actor);
    order.settlementBatchId = batchId;
  }

  db.settlementBatches.push(batch);
  db.settlementItems.push(...items);
  return batch;
}

export function settlementToCsv(batch, items) {
  const header = "orderId,fiatCurrency,fiatAmount,usdtAmount,serviceFee,networkFee,adjustment,status";
  const rows = items
    .filter((item) => item.settlementBatchId === batch.id)
    .map((item) => [
      item.orderId,
      item.fiatCurrency,
      item.fiatAmount,
      item.usdtAmount,
      item.serviceFee,
      item.networkFee,
      item.adjustment,
      item.status
    ].join(","));
  return [header, ...rows].join("\n");
}
