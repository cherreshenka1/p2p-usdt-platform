# Liquidity Reserve

## Purpose

USDT reserve guarantees that биржа не оказывается в ситуации, где пользователь уже отправил fiat, но USDT под заявку недоступен.

## Data

- totalBalance
- availableBalance
- lockedBalance
- releasedBalance
- minimumRequiredReserve
- network
- whitelisted wallet

## Rules

- reserve is per partner and network.
- release requires reserve lock.
- insufficient reserve blocks execution.
- released reserve is written into ledger.
- production should integrate custody/wallet provider and on-chain monitoring.
