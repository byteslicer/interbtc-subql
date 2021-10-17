import { SubstrateEvent } from "@subql/types";
import {
  BTCAddress,
  DepositCollateralEvent,
  Event,
  OracleExchangeRate,
  TokenIssueEvent,
  TokenRedeemEvent,
  WithdrawCollateralEvent,
} from "../types";
import { ensureBlock } from "./block";
import { ensureExtrinsic } from "./extrinsic";
import { getKVData } from "./utils/getKVData";
import type { ITuple } from "@polkadot/types/types";
import type { Vec } from "@polkadot/types";
import type {
  AccountId,
  BlockNumber,
} from "@polkadot/types/interfaces/runtime";
import {
  OracleKey,
  UnsignedFixedPoint,
  BtcAddress,
  Wrapped,
  Collateral,
} from "@interlay/interbtc-api";
import { ensureVault } from "./vault";
import BigNumber from "bignumber.js";

export function decodeFixedPointType(x: UnsignedFixedPoint): BigNumber {
  const xBig = new BigNumber(x.toString());
  //const scalingFactor = new BigNumber(Math.pow(10, FIXEDI128_SCALING_FACTOR));
  return xBig.shiftedBy(-18);
}

export async function ensureEvent(event: SubstrateEvent) {
  const block = await ensureBlock(event.block);

  const idx = event.idx;
  const recordId = `${block.number}-${idx}`;

  let data = await Event.get(recordId);

  if (!data) {
    data = new Event(recordId);
    data.index = idx;
    data.blockId = block.id;
    data.blockNumber = block.number;
    data.timestamp = block.timestamp;

    await data.save();
  }

  return data;
}

async function dispatch(type: string, evt: Event, rawEvent: SubstrateEvent) {
  switch (type) {
    case "oracle/FeedValues":
      {
        const [accountId, exchangeRates] = rawEvent.event.data as unknown as [
          AccountId,
          Vec<ITuple<[OracleKey, UnsignedFixedPoint]>>
        ];

        await Promise.all(
          exchangeRates.toArray().map(async ([key, value]) => {
            if (key.type === "ExchangeRate") {
              const data = new OracleExchangeRate(evt.id);
              data.timestamp = evt.timestamp;
              data.key = key.value.toString();
              data.origin = accountId.toHex();
              const converted =
                decodeFixedPointType(value).dp(4).toNumber() / 100;
              data.value = converted.toString();
              await data.save();
            } else if (key.type === "FeeEstimation") {
              // TODO: write FeeEstimation as well
            }
          })
        );
      }
      break;
    case "vaultRegistry/RegisterAddress":
      {
        const [accountId, btcAddress] = rawEvent.event.data as unknown as [
          AccountId,
          BtcAddress
        ];
        const vault = await ensureVault(accountId);
        vault.lastEventAt = evt.timestamp;
        const address = btcAddress.toHex();
        //logger.log(`RegisterAddress: ${address}`);
        const newAddress = new BTCAddress(address);
        newAddress.vaultId = vault.id;
        await newAddress.save();
      }
      break;
    case "vaultRegistry/RegisterVault":
      {
        const [accountId, collateral] = rawEvent.event.data as unknown as [
          AccountId,
          Collateral
        ];
        const vault = await ensureVault(accountId);
        vault.lastEventAt = evt.timestamp;
        vault.colateralAmount = collateral.toBigInt();
        vault.registerDate = evt.timestamp;
        await vault.save();
      }
      break;
    case "vaultRegistry/BanVault":
      {
        const [accountId, blockNumber] = rawEvent.event.data as unknown as [
          AccountId,
          BlockNumber
        ];
        const vault = await ensureVault(accountId);
        vault.lastEventAt = evt.timestamp;
        vault.bannedUntilBlock = blockNumber.toBigInt();
        await vault.save();
      }
      break;
    case "vaultRegistry/IncreaseToBeRedeemedTokens":
      {
        const [accountId, wrapped] = rawEvent.event.data as unknown as [
          AccountId,
          Wrapped
        ];
        const vault = await ensureVault(accountId);
        vault.lastEventAt = evt.timestamp;
        const oldValue = BigInt(vault.toBeRedeemedTokens || 0);
        vault.toBeRedeemedTokens = oldValue + wrapped.toBigInt();
        await vault.save();
      }
      break;
    case "vaultRegistry/DecreaseToBeRedeemedTokens":
      {
        const [accountId, wrapped] = rawEvent.event.data as unknown as [
          AccountId,
          Wrapped
        ];
        const vault = await ensureVault(accountId);
        vault.lastEventAt = evt.timestamp;
        const oldValue = BigInt(vault.toBeRedeemedTokens || 0);
        vault.toBeRedeemedTokens = oldValue - wrapped.toBigInt();
        await vault.save();
      }
      break;
    case "vaultRegistry/IncreaseToBeIssuedTokens":
      {
        const [accountId, wrapped] = rawEvent.event.data as unknown as [
          AccountId,
          Wrapped
        ];
        const vault = await ensureVault(accountId);
        vault.lastEventAt = evt.timestamp;
        const oldValue = BigInt(vault.toBeIssuedTokens || 0);
        vault.toBeIssuedTokens = oldValue + wrapped.toBigInt();
        await vault.save();
      }
      break;
    case "vaultRegistry/DecreaseToBeIssuedTokens":
      {
        const [accountId, wrapped] = rawEvent.event.data as unknown as [
          AccountId,
          Wrapped
        ];
        const vault = await ensureVault(accountId);
        vault.lastEventAt = evt.timestamp;
        const oldValue = BigInt(vault.toBeIssuedTokens || 0);
        vault.toBeIssuedTokens = oldValue - wrapped.toBigInt();
        await vault.save();
      }
      break;
    case "vaultRegistry/IssueTokens":
      {
        const [accountId, wrapped] = rawEvent.event.data as unknown as [
          AccountId,
          Wrapped
        ];
        const vault = await ensureVault(accountId);
        vault.lastEventAt = evt.timestamp;
        const oldValue = BigInt(vault.issuedTokens || 0);
        vault.issuedTokens = oldValue + wrapped.toBigInt();
        // vault.totalIssuedTokens =
        //   (vault.totalIssuedTokens || BigInt(0)) + wrapped.toBigInt();
        const issueEvent = new TokenIssueEvent(evt.id);
        issueEvent.timestamp = evt.timestamp;
        issueEvent.amount = wrapped.toBigInt();
        issueEvent.vaultId = vault.id;
        await vault.save();
        await issueEvent.save();
      }
      break;
    case "vaultRegistry/RedeemTokens":
      {
        const [accountId, wrapped] = rawEvent.event.data as unknown as [
          AccountId,
          Wrapped
        ];
        const vault = await ensureVault(accountId);
        vault.lastEventAt = evt.timestamp;
        const oldValue = BigInt(vault.issuedTokens || 0);
        vault.issuedTokens = oldValue - wrapped.toBigInt();
        // vault.totalRedeemedTokens =
        //   (vault.totalRedeemedTokens || BigInt(0)) + wrapped.toBigInt();
        const redeemEvent = new TokenRedeemEvent(evt.id);
        redeemEvent.timestamp = evt.timestamp;
        redeemEvent.amount = wrapped.toBigInt();
        redeemEvent.vaultId = vault.id;
        await vault.save();
        await redeemEvent.save();
      }
      break;
    case "vaultRegistry/DepositCollateral":
      {
        const [accountId, newCollateral, totalCollateral, freeCollateral] =
          rawEvent.event.data as unknown as [
            AccountId,
            Collateral,
            Collateral,
            Collateral
          ];
        const vault = await ensureVault(accountId);
        vault.lastEventAt = evt.timestamp;
        const oldValue = BigInt(vault.colateralAmount || 0);
        //const expectedValue = oldValue + newCollateral.toBigInt();
        // logger.log(
        //   `DepositCollateral: ${totalCollateral.toBigInt()} == ${expectedValue} `
        // );
        vault.colateralAmount = totalCollateral.toBigInt();

        const depositEvent = new DepositCollateralEvent(evt.id);
        depositEvent.timestamp = evt.timestamp;
        depositEvent.amount = newCollateral.toBigInt();
        depositEvent.totalColateral = totalCollateral.toBigInt();
        depositEvent.vaultId = vault.id;
        await vault.save();
        await depositEvent.save();
      }
      break;

    case "vaultRegistry/WithdrawCollateral":
      {
        const [accountId, withdrawnCollateral, totalCollateral] = rawEvent.event
          .data as unknown as [AccountId, Collateral, Collateral];
        const vault = await ensureVault(accountId);
        vault.lastEventAt = evt.timestamp;
        const oldValue = BigInt(vault.colateralAmount || 0);
        //const expectedValue = oldValue + newCollateral.toBigInt();
        // logger.log(
        //   `DepositCollateral: ${totalCollateral.toBigInt()} == ${expectedValue} `
        // );
        vault.colateralAmount = totalCollateral.toBigInt();

        const withdrawEvent = new WithdrawCollateralEvent(evt.id);
        withdrawEvent.timestamp = evt.timestamp;
        withdrawEvent.amount = withdrawnCollateral.toBigInt();
        withdrawEvent.totalColateral = totalCollateral.toBigInt();
        withdrawEvent.vaultId = vault.id;
        await vault.save();
        await withdrawEvent.save();
      }
      break;
  }
}

export async function handleEvent(event: SubstrateEvent): Promise<void> {
  const extrinsic = await (event.extrinsic
    ? ensureExtrinsic(event.extrinsic)
    : undefined);

  const data = await ensureEvent(event);

  const section = event.event.section;
  const method = event.event.method;
  const eventData = getKVData(event.event.data);

  data.section = section;
  data.method = method;
  data.data = eventData;

  if (extrinsic) {
    data.extrinsicId = extrinsic.id;
  }

  await dispatch(`${section}/${data.method}`, data, event);

  await data.save();
}
