import { makeId, nowIso, roundMoney } from "../domain/index.js";

export function findLedgerAccount(db, { ownerType, ownerId, asset = "USDT", currencyOrNetwork = "TRC20" }) {
  return db.ledgerAccounts.find((account) => (
    account.ownerType === ownerType &&
    account.ownerId === ownerId &&
    account.asset === asset &&
    account.currencyOrNetwork === currencyOrNetwork
  ));
}

export function ensureUserUsdtAccount(db, userId, network = "TRC20") {
  let account = findLedgerAccount(db, {
    ownerType: "user",
    ownerId: userId,
    asset: "USDT",
    currencyOrNetwork: network
  });
  if (!account) {
    account = {
      id: makeId("ledger_user"),
      ownerType: "user",
      ownerId: userId,
      asset: "USDT",
      currencyOrNetwork: network,
      balance: 0
    };
    db.ledgerAccounts.push(account);
  }
  return account;
}

export function assertLedgerBalanced(entries) {
  const debit = entries.reduce((sum, entry) => sum + Number(entry.debitAmount || 0), 0);
  const credit = entries.reduce((sum, entry) => sum + Number(entry.creditAmount || 0), 0);
  if (roundMoney(debit) !== roundMoney(credit)) {
    throw new Error(`Ledger group is not balanced: debit=${debit} credit=${credit}`);
  }
}

export function postLedgerGroup(db, { orderId, reason, actor = "system", entries }) {
  assertLedgerBalanced(entries);
  const groupId = makeId("ledgrp");
  const createdAt = nowIso();
  const posted = entries.map((entry) => {
    const account = db.ledgerAccounts.find((candidate) => candidate.id === entry.accountId);
    if (!account) throw new Error(`Ledger account not found: ${entry.accountId}`);
    const debit = Number(entry.debitAmount || 0);
    const credit = Number(entry.creditAmount || 0);
    const delta = roundMoney(debit - credit);
    const nextBalance = roundMoney(account.balance + delta);
    if (account.ownerType === "partner_reserve" && nextBalance < 0) {
      throw new Error("Partner reserve ledger account cannot go negative");
    }
    account.balance = nextBalance;
    return {
      id: makeId("led"),
      transactionGroupId: groupId,
      orderId,
      accountId: account.id,
      asset: account.asset,
      currencyOrNetwork: account.currencyOrNetwork,
      debitAmount: debit,
      creditAmount: credit,
      reason,
      actor,
      createdAt
    };
  });
  db.ledgerEntries.push(...posted);
  return posted;
}

export function lockReserve(db, order) {
  const reserve = db.usdtReserves.find((candidate) => (
    candidate.partnerId === order.partnerId &&
    candidate.network === order.network &&
    candidate.status === "active"
  ));
  if (!reserve) throw new Error("Active USDT reserve not found");
  if (reserve.availableBalance < order.usdtAmount) {
    throw new Error("Insufficient USDT reserve");
  }
  reserve.availableBalance = roundMoney(reserve.availableBalance - order.usdtAmount);
  reserve.lockedBalance = roundMoney(reserve.lockedBalance + order.usdtAmount);
  const lock = {
    id: makeId("lock"),
    orderId: order.id,
    partnerId: order.partnerId,
    reserveId: reserve.id,
    network: order.network,
    amount: order.usdtAmount,
    status: "locked",
    createdAt: nowIso(),
    releasedAt: null
  };
  db.reserveLocks.push(lock);
  return lock;
}

export function releaseReserveToUser(db, order) {
  const lock = db.reserveLocks.find((candidate) => candidate.orderId === order.id && candidate.status === "locked");
  if (!lock) throw new Error("Reserve lock not found");
  const reserve = db.usdtReserves.find((candidate) => candidate.id === lock.reserveId);
  if (!reserve) throw new Error("Reserve not found");
  reserve.lockedBalance = roundMoney(reserve.lockedBalance - lock.amount);
  reserve.releasedBalance = roundMoney(reserve.releasedBalance + lock.amount);
  lock.status = "released";
  lock.releasedAt = nowIso();

  const reserveAccount = findLedgerAccount(db, {
    ownerType: "partner_reserve",
    ownerId: order.partnerId,
    asset: "USDT",
    currencyOrNetwork: order.network
  });
  const userAccount = ensureUserUsdtAccount(db, order.userId, order.network);
  if (!reserveAccount) throw new Error("Reserve ledger account not found");

  return postLedgerGroup(db, {
    orderId: order.id,
    reason: "usdt_release_to_user",
    entries: [
      { accountId: userAccount.id, debitAmount: lock.amount, creditAmount: 0 },
      { accountId: reserveAccount.id, debitAmount: 0, creditAmount: lock.amount }
    ]
  });
}
