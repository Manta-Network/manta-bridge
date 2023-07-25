import { Storage } from "@acala-network/sdk/utils/storage";
import { AnyApi, FixedPointNumber as FN } from "@acala-network/sdk-core";
import { combineLatest, map, Observable } from "rxjs";

import { SubmittableExtrinsic } from "@polkadot/api/types";
import { DeriveBalancesAll } from "@polkadot/api-derive/balances/types";
import { ISubmittableResult } from "@polkadot/types/types";

import { BalanceAdapter, BalanceAdapterConfigs } from "../balance-adapter";
import { BaseCrossChainAdapter } from "../base-chain-adapter";
import { ChainId, chains } from "../configs";
import { ApiNotFound, InvalidAddress, TokenNotFound } from "../errors";
import { BalanceData, ExtendedToken, TransferParams } from "../types";
import { createRouteConfigs, validateAddress } from "../utils";
import { isChainEqual } from "../utils/is-chain-equal";

const DEST_WEIGHT = "5000000000";

export const mantaRouteConfigs = createRouteConfigs("manta", [
  {
    to: "polkadot",
    token: "DOT",
    xcm: {
      fee: { token: "DOT", amount: "364421524" },
      weightLimit: DEST_WEIGHT,
    },
  },
  {
    to: "acala",
    token: "ACA",
    xcm: {
      fee: { token: "ACA", amount: "8082400000" },
      weightLimit: DEST_WEIGHT,
    },
  },
  {
    to: "moonbeam",
    token: "GLMR",
    xcm: {
      fee: { token: "GLMR", amount: "5444794429171897" },
      weightLimit: DEST_WEIGHT,
    },
  },
]);

export const mantaTokensConfig: Record<string, ExtendedToken> = {
  MANTA: {
    name: "MANTA",
    symbol: "MANTA",
    decimals: 18,
    ed: "100000000000000000",
    toRaw: () => ({ MantaCurrency: 1 }),
  },
  DOT: {
    name: "DOT",
    symbol: "DOT",
    decimals: 10,
    ed: "10000000000",
    toRaw: () => ({ MantaCurrency: 8 }),
  },
  ACA: {
    name: "ACA",
    symbol: "ACA",
    decimals: 12,
    ed: "100000000000",
    toRaw: () => ({ MantaCurrency: 11 }),
  },
  GLMR: {
    name: "GLMR",
    symbol: "GLMR",
    decimals: 18,
    ed: "100000000000000000",
    toRaw: () => ({ MantaCurrency: 10 }),
  },
};

export const calamariRouteConfigs = createRouteConfigs("calamari", [
  {
    to: "karura",
    token: "KMA",
    xcm: {
      fee: { token: "KMA", amount: "6400000000" },
      weightLimit: DEST_WEIGHT,
    },
  },
  {
    to: "karura",
    token: "KUSD",
    xcm: {
      fee: { token: "KUSD", amount: "6381112603" },
      weightLimit: DEST_WEIGHT,
    },
  },
  {
    to: "karura",
    token: "KAR",
    xcm: {
      fee: { token: "KAR", amount: "6400000000" },
      weightLimit: DEST_WEIGHT,
    },
  },
  {
    to: "karura",
    token: "LKSM",
    xcm: {
      fee: { token: "LKSM", amount: "452334406" },
      weightLimit: DEST_WEIGHT,
    },
  },
  {
    to: "karura",
    token: "KSM",
    xcm: {
      fee: { token: "KSM", amount: "54632622" },
      weightLimit: DEST_WEIGHT,
    },
  },
  {
    to: "karura",
    token: "USDCet",
    xcm: {
      fee: { token: "USDCet", amount: "808" },
      weightLimit: DEST_WEIGHT,
    },
  },
  {
    to: "karura",
    token: "USDT",
    xcm: {
      fee: { token: "USDT", amount: "808" },
      weightLimit: DEST_WEIGHT,
    },
  },
  {
    to: "karura",
    token: "DAI",
    xcm: {
      fee: { token: "DAI", amount: "808240000000000" },
      weightLimit: DEST_WEIGHT,
    },
  },
  {
    to: "kusama",
    token: "KSM",
    xcm: {
      fee: { token: "KSM", amount: "90287436" },
      weightLimit: DEST_WEIGHT,
    },
  },
  {
    to: "moonriver",
    token: "MOVR",
    xcm: {
      fee: { token: "MOVR", amount: "23356409465885" },
      weightLimit: DEST_WEIGHT,
    },
  },
]);

export const calamariTokensConfig: Record<string, ExtendedToken> = {
  KMA: {
    name: "KMA",
    symbol: "KMA",
    decimals: 12,
    ed: "100000000000",
    toRaw: () => ({ MantaCurrency: 1 }),
  },
  KAR: {
    name: "KAR",
    symbol: "KAR",
    decimals: 12,
    ed: "100000000000",
    toRaw: () => ({ MantaCurrency: 8 }),
  },
  KUSD: {
    name: "KUSD",
    symbol: "KUSD",
    decimals: 12,
    ed: "10000000000",
    toRaw: () => ({ MantaCurrency: 9 }),
  },
  LKSM: {
    name: "LKSM",
    symbol: "LKSM",
    decimals: 12,
    ed: "500000000",
    toRaw: () => ({ MantaCurrency: 10 }),
  },
  KSM: {
    name: "KSM",
    symbol: "KSM",
    decimals: 12,
    ed: "100000000",
    toRaw: () => ({ MantaCurrency: 12 }),
  },
  USDT: {
    name: "USDT",
    symbol: "USDT",
    decimals: 6,
    ed: "10000",
    toRaw: () => ({ MantaCurrency: 14 }),
  },
  DAI: {
    name: "DAI",
    symbol: "DAI",
    decimals: 18,
    ed: "10000000000000000",
    toRaw: () => ({ MantaCurrency: 15 }),
  },
  USDCet: {
    name: "USDCet",
    symbol: "USDCet",
    decimals: 6,
    ed: "10000",
    toRaw: () => ({ MantaCurrency: 16 }),
  },
  MOVR: {
    name: "MOVR",
    symbol: "MOVR",
    decimals: 18,
    ed: "100000000000000000",
    toRaw: () => ({ MantaCurrency: 11 }),
  },
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
const createBalanceStorages = (api: AnyApi) => {
  return {
    balances: (address: string) =>
      Storage.create<DeriveBalancesAll>({
        api,
        path: "derive.balances.all",
        params: [address],
      }),
    assets: (id: number, address: string) =>
      Storage.create<any>({
        api,
        path: "query.assets.account",
        params: [id, address],
      }),
  };
};

class MantaBalanceAdapter extends BalanceAdapter {
  private storages: ReturnType<typeof createBalanceStorages>;

  constructor({ api, chain, tokens }: BalanceAdapterConfigs) {
    super({ api, chain, tokens });
    this.storages = createBalanceStorages(api);
  }

  public subscribeBalance(
    token: string,
    address: string
  ): Observable<BalanceData> {
    if (!validateAddress(address)) throw new InvalidAddress(address);

    const storage = this.storages.balances(address);

    if (token === this.nativeToken) {
      return storage.observable.pipe(
        map((data) => ({
          free: FN.fromInner(data.freeBalance.toString(), this.decimals),
          locked: FN.fromInner(data.lockedBalance.toString(), this.decimals),
          reserved: FN.fromInner(
            data.reservedBalance.toString(),
            this.decimals
          ),
          available: FN.fromInner(
            data.availableBalance.toString(),
            this.decimals
          ),
        }))
      );
    }

    const tokenData: ExtendedToken = this.getToken(token);

    if (!tokenData) throw new TokenNotFound(token);

    return this.storages.assets(tokenData.toRaw(), address).observable.pipe(
      map((balance) => {
        const amount = FN.fromInner(
          balance.unwrapOrDefault()?.balance?.toString() || "0",
          tokenData.decimals
        );

        return {
          free: amount,
          locked: new FN(0),
          reserved: new FN(0),
          available: amount,
        };
      })
    );
  }
}

class BaseMantaAdapter extends BaseCrossChainAdapter {
  private balanceAdapter?: MantaBalanceAdapter;

  public async init(api: AnyApi) {
    this.api = api;

    await api.isReady;

    this.balanceAdapter = new MantaBalanceAdapter({
      chain: this.chain.id as ChainId,
      api,
      tokens: this.tokens,
    });
  }

  public subscribeTokenBalance(
    token: string,
    address: string
  ): Observable<BalanceData> {
    if (!this.balanceAdapter) {
      throw new ApiNotFound(this.chain.id);
    }

    return this.balanceAdapter.subscribeBalance(token, address);
  }

  public subscribeMaxInput(
    token: string,
    address: string,
    to: ChainId
  ): Observable<FN> {
    if (!this.balanceAdapter) {
      throw new ApiNotFound(this.chain.id);
    }

    return combineLatest({
      txFee:
        token === this.balanceAdapter?.nativeToken
          ? this.estimateTxFee({
              amount: FN.ZERO,
              to,
              token,
              address,
              signer: address,
            })
          : "0",
      balance: this.balanceAdapter
        .subscribeBalance(token, address)
        .pipe(map((i) => i.available)),
    }).pipe(
      map(({ balance, txFee }) => {
        const tokenMeta = this.balanceAdapter?.getToken(token);
        const feeFactor = 1.2;
        const fee = FN.fromInner(txFee, tokenMeta?.decimals).mul(
          new FN(feeFactor)
        );

        // always minus ed
        return balance
          .minus(fee)
          .minus(FN.fromInner(tokenMeta?.ed || "0", tokenMeta?.decimals));
      })
    );
  }

  public createTx(
    params: TransferParams
  ):
    | SubmittableExtrinsic<"promise", ISubmittableResult>
    | SubmittableExtrinsic<"rxjs", ISubmittableResult> {
    if (this.api === undefined) {
      throw new ApiNotFound(this.chain.id);
    }
    const { address, amount, to, token } = params;
    const toChain = chains[to];
    const tokenData: ExtendedToken = this.getToken(token);

    if (
      isChainEqual(toChain, "moonriver") ||
      isChainEqual(toChain, "moonbeam")
    ) {
      const dst = {
        parents: 1,
        interior: {
          X2: [
            { Parachain: toChain.paraChainId },
            { AccountKey20: { key: address, network: "Any" } },
          ],
        },
      };
      return this.api?.tx.xTokens.transfer(
        tokenData.toRaw(),
        amount.toChainData(),
        {
          V1: dst,
        },
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        { Limited: this.getDestWeight(token, to)!.toString() }
      );
    }
    return this.createXTokensTx(params);
  }
}

export class CalamariAdapter extends BaseMantaAdapter {
  constructor() {
    super(chains.calamari, calamariRouteConfigs, calamariTokensConfig);
  }
}

export class MantaAdapter extends BaseMantaAdapter {
  constructor() {
    super(chains.manta, mantaRouteConfigs, mantaTokensConfig);
  }
}
