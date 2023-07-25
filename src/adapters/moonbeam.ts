import { AnyApi, FixedPointNumber as FN } from "@acala-network/sdk-core";
import { combineLatest, from, map, Observable } from "rxjs";

import { SubmittableExtrinsic } from "@polkadot/api/types";
import { ISubmittableResult } from "@polkadot/types/types";

import { BaseCrossChainAdapter } from "../base-chain-adapter";
import { ChainId, chains } from "../configs";
import { ApiNotFound, TokenNotFound } from "../errors";
import { BalanceData, BasicToken, TransferParams } from "../types";
import { createRouteConfigs } from "../utils";
import { Storage } from "@acala-network/sdk/utils/storage";
import { DeriveBalancesAll } from "@polkadot/api-derive/balances/types";
import { BalanceAdapter, BalanceAdapterConfigs } from "../balance-adapter";
import { BN } from "@polkadot/util";

export const moonbeamRoutersConfig = createRouteConfigs("moonriver", [
  {
    to: "manta",
    token: "GLMR",
    xcm: {
      fee: { token: "GLMR", amount: "921009000000000000" },
      weightLimit: "Unlimited",
    },
  },
]);

export const moonriverRoutersConfig = createRouteConfigs("moonriver", [
  {
    to: "calamari",
    token: "MOVR",
    xcm: {
      fee: { token: "MOVR", amount: "503025000000000" },
      weightLimit: "Unlimited",
    },
  },
]);

export const moonbeamTokensConfig: Record<string, BasicToken> = {
  GLMR: {
    name: "GLMR",
    symbol: "GLMR",
    decimals: 18,
    ed: "100000000000000000",
  },
  ACA: { name: "ACA", symbol: "ACA", decimals: 12, ed: "100000000000" },
  AUSD: { name: "AUSD", symbol: "AUSD", decimals: 12, ed: "100000000000" },
  LDOT: { name: "LDOT", symbol: "LDOT", decimals: 10, ed: "500000000" },
  DOT: { name: "DOT", symbol: "DOT", decimals: 10, ed: "10000000000" },
};

export const moonriverTokensConfig: Record<string, BasicToken> = {
  MOVR: { name: "MOVR", symbol: "MOVR", decimals: 18, ed: "1000000000000000" },
  KAR: { name: "KAR", symbol: "KAR", decimals: 12, ed: "0" },
  KUSD: { name: "KUSD", symbol: "KUSD", decimals: 12, ed: "0" },
};

const SUPPORTED_TOKENS: Record<string, string> = {
  MOVR: "MOVR",
  GLMR: "GLMR",
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
    assets: (tokenId: string, address: string) =>
      Storage.create<any>({
        api,
        path: "query.assets.account",
        params: [tokenId, address],
      }),
  };
};

class MoonbeamBalanceAdapter extends BalanceAdapter {
  private storages: ReturnType<typeof createBalanceStorages>;

  constructor({ api, chain, tokens }: BalanceAdapterConfigs) {
    super({ api, chain, tokens });
    this.storages = createBalanceStorages(api);
  }

  public subscribeBalance(
    token: string,
    address: string
  ): Observable<BalanceData> {
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

    const tokenId = SUPPORTED_TOKENS[token];
    console.log("moonbeam token", token);

    if (tokenId === undefined) {
      throw new TokenNotFound(token);
    }

    return this.storages.assets(address, tokenId).observable.pipe(
      map((balance) => {
        const amount = FN.fromInner(
          balance.free?.toString() || "0",
          this.getToken(tokenId).decimals
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

class BaseMoonbeamAdapter extends BaseCrossChainAdapter {
  private balanceAdapter?: MoonbeamBalanceAdapter;

  public async init(api: AnyApi) {
    this.api = api;

    await api.isReady;

    this.balanceAdapter = new MoonbeamBalanceAdapter({
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

  public override estimateTxFee(_: TransferParams): Observable<string> {
    const MOONBEAM_XCM_GAS = new BN(35697);
    return from(
      (async () => {
        const baseFee: any = await this.api?.rpc.eth.gasPrice();
        const minFee = baseFee.mul(MOONBEAM_XCM_GAS);
        // Metamask default fee is minFee * 1.5
        const mediumFee = minFee.mul(new BN(3)).div(new BN(2));
        return mediumFee.toString();
      })()
    );
  }

  public createTx(
    _: TransferParams
  ):
    | SubmittableExtrinsic<"promise", ISubmittableResult>
    | SubmittableExtrinsic<"rxjs", ISubmittableResult> {
    throw new ApiNotFound(this.chain.id);
  }
}

export class MoonbeamAdapter extends BaseMoonbeamAdapter {
  constructor() {
    super(chains.moonbeam, moonbeamRoutersConfig, moonbeamTokensConfig);
  }
}

export class MoonriverAdapter extends BaseMoonbeamAdapter {
  constructor() {
    super(chains.moonriver, moonriverRoutersConfig, moonriverTokensConfig);
  }
}
