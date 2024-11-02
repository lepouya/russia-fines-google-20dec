import Decimal, { DecimalSource } from "break_eternity.js";

import clamp from "../utils/clamp";

export default class Resource {
  /** Resource name */
  readonly name: string;
  /** Long description of this resource */
  description?: string;
  /** Indicated how to display this resource while rendering */
  display?: DisplayStyle;
  /** Name of the icon to be sent to the <Icon /> component  */
  icon?: string;
  /** How to pretty display this resource when there's only 1 of it. Defaults to name */
  singularName?: string;
  /** How to pretty display this resource when there's more than 1 of it. Defaults to name */
  pluralName?: string;
  /** Whether this resource is locked and cannot be seen or used */
  locked?: boolean;
  /** Whether this resource is disabled and cannot be used */
  disabled?: boolean;
  /** Whether this resource is hidden and cannot be seen, but still receives events */
  hidden?: boolean;
  /** Priority of this resource when showing in a list */
  priority: number = Infinity;
  /** Can this resource automatically unlock when the conditions are met? */
  autoUnlock?: boolean;
  /** Can this resource automatically increment when the purchase cost is met? */
  autoAward?: boolean;
  /** Extra metadata that can be attached to this resource */
  extra: Record<string, any> = {};

  /** Current value of the resource */
  count: Decimal = Decimal.dZero;
  /** Maximum value of the resource. Cannot purchase any more after this point */
  maxCount?: Decimal;
  /** Minimum value of the resource. Cannot sell any more after this point */
  minCount?: Decimal;
  /** Rate of change of the resource. Automatically calculated on ticks */
  rate: Decimal = Decimal.dZero;
  /** The last time this resource received an update tick */
  lastTick: number = 0;

  /** Custom function that is called to validate the count before setting. Defaults to no-op */
  validateCount?: (count: DecimalSource) => DecimalSource;
  /** Custom function called to calculate the cost of buying the next increment of this resource at point count. Defaults to free */
  purchaseCost?: (count: DecimalSource) => ResourceCount[];
  /** Custom function called to calculate the unlocking cost of the resource. Defaults to free */
  unlockCost?: () => ResourceCount[];
  /** Custom function called to modify the gain factor of a resource with bonuses/penalties. Defaults to 1 */
  gainFactor?: (n: DecimalSource) => DecimalSource;
  /** Custom function called to modify the cost factor of a resource with bonuses/penalties. Defaults to 1 */
  costFactor?: (n: DecimalSource) => DecimalSource;

  /** Event called to validate if the resource should receive an update. Defaults to true */
  shouldTick?: (dt: number, source?: string) => boolean;
  /** Event called when the resource receives an update loop tick */
  onTick?: (dt: number, source?: string) => void;
  /** Event called when the value of the resource changes */
  onChange?: (count: DecimalSource, source?: string) => void;
  /** Event called when the resource is purchased or sold */
  onPurchase?: (value: PurchaseCost) => void;

  /** Record of all resources for bookkeeping */
  static readonly ALL: Record<string, Resource> = {};

  /** Custom function called to modify the gain factor of all resources with bonuses/penalties. Defaults to 1 */
  static globalGainFactor?: (n: DecimalSource) => DecimalSource;
  /** Custom function called to modify the cost factor of all resources with bonuses/penalties. Defaults to 1 */
  static globalCostFactor?: (n: DecimalSource) => DecimalSource;
  /** Ratio of selling to buy cost that is refunded. Defaults to 1 */
  static globalSellRatio?: DecimalSource;
  /** How frequently resource rates should be updated */
  static rateUpdateSecs: number = 0.25;
  /** Exponential moving average factor for computing rates */
  static rateUpdateEMAFactor: number = 0.25;

  constructor(name: string) {
    this.name = name;
    if (Resource.ALL[name]) {
      return Resource.ALL[name];
    }
    Resource.ALL[name] = this;
  }

  /** Resolve a resource from possibly incomplete information */
  static get(res: string | Partial<Resource>): Resource {
    return res instanceof Resource
      ? res
      : Resource.ALL[typeof res === "string" ? res : res.name ?? ""] ??
          Resource.upsert(res);
  }

  /** Resolve a list of resources and their counts from possibly incomplete information */
  static resolveAll(rcs: ResourceCount[]): ResourceCount<"resolved">[] {
    return rcs
      .map((rc) => ({
        resource: Resource.get(rc.resource),
        count: Decimal.fromValue_noAlloc(rc.count),
      }))
      .filter((rrc) => rrc.resource && rrc.count.neq(0));
  }

  /** Create or update a resource from given properties */
  static upsert(props: string | Partial<Resource>): Resource {
    const name = typeof props === "string" ? props : props.name ?? "";
    const res = Resource.ALL[name] ?? new Resource(name);

    if (typeof props !== "string") {
      let k: keyof Resource;
      for (k in props) {
        if (k === "extra") {
          res[k] = { ...res[k], ...props[k] };
        } else if (k === "count" || k === "maxCount" || k === "minCount") {
          if (props[k] != undefined) {
            res[k] = Decimal.fromValue(props[k]!);
          }
        } else if (k !== "name" && props[k] != undefined) {
          (res as any)[k] = props[k];
        }
      }
    }

    if (res.name) {
      Resource.ALL[res.name] = res;
    }

    return res;
  }

  /** Reset the state of all resources to undefined */
  static reset() {
    const toDelete = Object.keys(Resource.ALL);
    toDelete.forEach((name) => delete Resource.ALL[name]);
  }

  /**
   * Check if there currently exists enough resources to afford the given cost
   * @param cost List of resources to check against
   * @param toSpend Whether this is for actual spending or not. to check against the minCount or the count
   * @returns Whether the cost can be afforded
   */
  static canAfford(cost: ResourceCount[], toSpend = true): boolean {
    return Resource.combine(Resource.resolveAll(cost)).every(
      ({ resource, count }) =>
        !resource.locked &&
        resource.count.minus(count).gte(toSpend ? resource.minCount ?? 0 : 0),
    );
  }

  /**
   * Purchase the given resources with the given style and factors
   * @param toBuy Count of resources to purchase
   * @param style Whether to purchase full, partial, or as a dry-run
   * @param gainFactor Extra bonus factor to apply to the gain
   * @param costFactor Extra bonus factor to apply to the cost
   * @param countOverride Override the count of the resource for calculations
   * @returns The purchase that actually took place
   */
  static purchase(
    toBuy: ResourceCount[],
    style: PurchaseStyle = "partial",
    gainFactor: DecimalSource = 1,
    costFactor: DecimalSource = 1,
    countOverride?: DecimalSource,
  ): PurchaseCost<"resolved"> {
    gainFactor = Resource.globalGainFactor?.(gainFactor) ?? gainFactor;
    costFactor = Resource.globalCostFactor?.(costFactor) ?? costFactor;

    const costs = Resource.resolveAll(toBuy).map(({ resource, count }) => {
      const rcCost = resource.getPurchaseCost(
        count,
        style,
        resource.gainFactor?.(gainFactor) ?? gainFactor,
        resource.costFactor?.(costFactor) ?? costFactor,
        countOverride,
      );

      if (style.includes("dry") || Decimal.eq(rcCost.count, 0)) {
        return rcCost;
      } else {
        if (resource.locked) {
          if (resource.unlockCost) {
            resource.locked = false;
          } else {
            return { count: 0, style, gain: [], cost: [] };
          }
        }

        const gain = resource.apply(rcCost.gain);
        const cost = rcCost.cost
          .map(({ resource, count }) =>
            resource.apply([{ resource, count: count.neg() }]),
          )
          .flat();

        const purchaseCost = { ...rcCost, gain, cost };
        resource.onPurchase?.(purchaseCost);
        return purchaseCost;
      }
    });

    return {
      count: costs.reduce((count, rc) => count.plus(rc.count), Decimal.dZero),
      style,
      gain: Resource.combine(costs.map((rcCost) => rcCost.gain).flat()),
      cost: Resource.combine(costs.map((rcCost) => rcCost.cost).flat()),
    };
  }

  /**
   * Purchase multiple resources at the same time
   * @param resources List of resources to purchase with their count overrides if needed. Defaults to everything
   * @param amount The amount to buy from each resource
   * @param style Whether to purchase full, partial, or as a dry-run
   * @param gainFactor Extra bonus factor to apply to the gain
   * @param costFactor Extra bonus factor to apply to the cost
   * @param countOverride Override the count of all resources for calculations
   * @returns The purchase that actually took place
   */
  static purchaseAll(
    resources: Record<string, DecimalSource | undefined> = {},
    amount: PurchaseAmount = 1,
    style: PurchaseStyle = "partial",
    gainFactor: DecimalSource = 1,
    costFactor: DecimalSource = 1,
    countOverride?: DecimalSource,
  ): PurchaseCost<"resolved"> {
    let toBuy = Object.values(Resource.ALL).filter(
      (res) => !res.locked && !res.disabled,
    );
    const limits = Object.keys(resources);
    if (limits.length > 0) {
      toBuy = toBuy.filter((res) => limits.includes(res.name));
    }

    const costs = toBuy.map((res) => {
      return res.buy(
        amount,
        style,
        gainFactor,
        costFactor,
        resources[res.name] ?? countOverride,
      );
    });
    return {
      count: costs.reduce((count, rc) => count.plus(rc.count), Decimal.dZero),
      style,
      gain: Resource.combine(costs.map((rcCost) => rcCost.gain).flat()),
      cost: Resource.combine(costs.map((rcCost) => rcCost.cost).flat()),
    };
  }

  /**
   * Perform an update tick on all resources
   * @param dt delta time in seconds since the last tick
   * @param source The source of the tick
   * @param cumulativeResults Map of all the changes that happened prior to the tick, if any
   * @returns Map of all the changes that happened during the tick plus possibly the cumulative past results
   */
  static tickAll(
    dt: number,
    source?: string,
    cumulativeResults: Record<string, Decimal> = {},
  ): Record<string, Decimal> {
    let resources = Object.values(Resource.ALL);

    // Auto unlock the resources that are eligible
    resources.forEach((res) => {
      if (res.autoUnlock && !res.disabled && res.locked) {
        if (
          Resource.canAfford(
            res.unlockCost?.() ?? res.purchaseCost?.(1) ?? [],
            false,
          )
        ) {
          res.locked = false;
        }
      }
    });

    // No point in updating locked or disabled resources after this point
    resources = resources.filter((res) => !res.locked && !res.disabled);

    // Keep a cache of current values for all resources so we can tell what changed
    const cache: Record<string, Decimal> = {};
    resources.forEach((res) => {
      cache[res.name] = res.count;
    });

    // Tick all resources that are eligible
    resources.forEach((res) => {
      if (res.shouldTick?.(dt, source) ?? true) {
        res.onTick?.(dt, source);
      }
    });

    // Auto award the resources that are eligible
    resources.forEach((res) => {
      if (res.autoAward && !res.disabled && res.count.lt(res.maxCount ?? 0)) {
        if (
          Resource.canAfford(res.purchaseCost?.(res.count.add(1)) ?? [], false)
        ) {
          res.award(1);
        }
      }
    });

    // Update rates for all resources
    resources.forEach((res) => {
      res.updateRate(dt);
    });

    // Figure out the cumulative results of changed resources
    resources.forEach((res) => {
      cache[res.name] = res.count.minus(cache[res.name] ?? 0);
      if (cache[res.name].neq(0)) {
        cumulativeResults[res.name] = cache[res.name].add(
          cumulativeResults[res.name] ?? Decimal.dZero,
        );
        if (cumulativeResults[res.name].eq(0)) {
          delete cumulativeResults[res.name];
        }
      }
    });

    return cumulativeResults;
  }

  /// TODO: load, save, format

  /**
   * Purchase the given amount of this resource with the given style and factors
   * @param amount How much to buy. Could be a number or a range
   * @param style Whether to purchase full, partial, or as a dry-run
   * @param gainFactor Extra bonus factor to apply to the gain
   * @param costFactor Extra bonus factor to apply to the cost
   * @param countOverride Override the count of the resource for calculations
   * @returns The purchase that actually took place
   */
  buy(
    amount: PurchaseAmount = 1,
    style: PurchaseStyle = "partial",
    gainFactor: DecimalSource = 1,
    costFactor: DecimalSource = 1,
    countOverride?: DecimalSource,
  ): PurchaseCost<"resolved"> {
    if (typeof amount !== "object" || amount instanceof Decimal) {
      return Resource.purchase(
        [{ resource: this, count: Decimal.fromValue_noAlloc(amount) }],
        style,
        gainFactor,
        costFactor,
        countOverride,
      );
    }

    const current = this.getCount(countOverride).toNumber();
    if (
      !isFinite(current) ||
      Math.abs(amount.minAmount) > Math.abs(amount.maxAmount) ||
      Math.abs(amount.maxAmount) > 1000 ||
      amount.increments === 0
    ) {
      return { count: Decimal.dZero, style, gain: [], cost: [] };
    }

    const minCount = this.minCount?.toNumber() ?? 0,
      maxCount = this.maxCount?.toNumber() ?? Infinity,
      increment = amount.increments;
    function adjust(c: number) {
      return (
        clamp(
          Math.floor((current + c) / increment) * increment,
          minCount,
          maxCount,
        ) - current
      );
    }

    // Try to buy max amount allowed
    let toBuy = Resource.purchase(
      [
        {
          resource: this,
          count: Decimal.fromValue_noAlloc(adjust(amount.maxAmount)),
        },
      ],
      "dry-partial",
      gainFactor,
      costFactor,
      countOverride,
    );
    let pCount = (toBuy.count as Decimal).toNumber();

    // Something partial came back, so adjust it to increments
    if (pCount % increment !== 0) {
      toBuy = Resource.purchase(
        [{ resource: this, count: Decimal.fromValue_noAlloc(adjust(pCount)) }],
        "dry-partial",
        gainFactor,
        costFactor,
        countOverride,
      );
      pCount = (toBuy.count as Decimal).toNumber();
    }

    // Can't afford anything
    if (
      pCount === 0 ||
      (amount.minAmount >= 0 && pCount < amount.minAmount) ||
      (amount.minAmount < 0 && pCount > amount.minAmount)
    ) {
      if (!style.includes("dry")) {
        return { count: Decimal.dZero, style, gain: [], cost: [] };
      }

      const adjusted = adjust(
        clamp(
          increment,
          Math.min(amount.minAmount, amount.maxAmount),
          Math.max(amount.minAmount, amount.maxAmount),
        ),
      );
      const count = Decimal.fromValue_noAlloc(
        adjusted === 0 ? Math.sign(increment) : adjusted,
      );
      toBuy = Resource.purchase(
        [{ resource: this, count }],
        "dry-full",
        gainFactor,
        costFactor,
        countOverride,
      );
      pCount = (toBuy.count as Decimal).toNumber();
    }

    if (style.includes("dry")) {
      return toBuy;
    } else {
      return Resource.purchase(
        [{ resource: this, count: Decimal.fromValue_noAlloc(pCount) }],
        style,
        gainFactor,
        costFactor,
        countOverride,
      );
    }
  }

  /**
   * Sell the given amount of this resource with the given style and factors
   * @param amount How much to sell. Could be a number or a range
   * @param style Whether to purchase full, partial, or as a dry-run
   * @param gainFactor Extra bonus factor to apply to the gain
   * @param costFactor Extra bonus factor to apply to the cost
   * @param countOverride Override the count of the resource for calculations
   * @returns The sale that actually took place
   */
  sell(
    amount: PurchaseAmount = 1,
    style: PurchaseStyle = "full",
    gainFactor: DecimalSource = 1,
    sellFactor: DecimalSource = 1,
    countOverride?: DecimalSource,
  ): PurchaseCost<"resolved"> {
    return this.buy(
      typeof amount !== "object" || amount instanceof Decimal
        ? Decimal.neg(amount)
        : {
            minAmount: -amount.minAmount,
            maxAmount: -amount.maxAmount,
            increments: -amount.increments,
          },
      style,
      gainFactor,
      sellFactor,
      countOverride,
    );
  }

  /**
   * Check if this resource can be bought with the given amount and factors
   * @param amount The amount we would like to buy
   * @param costFactor Extra bonus factor to apply to the cost
   * @param countOverride Override the count of the resource for calculations
   * @returns The amount that can be purchased
   */
  canBuy(
    amount?: PurchaseAmount,
    costFactor?: DecimalSource,
    countOverride?: DecimalSource,
  ): PurchaseCost<"resolved"> {
    return this.buy(amount, "dry-partial", 1, costFactor, countOverride);
  }

  /** Add a given amount of this resource for free */
  award(amount?: PurchaseAmount): PurchaseCost<"resolved"> {
    return this.buy(amount, "free");
  }

  /** Set the value of the resource while verifying the sources */
  setValue(value: DecimalSource, source?: string): Decimal {
    if (this.validateCount) {
      value = this.validateCount(value);
    }
    if (this.maxCount) {
      value = Decimal.min(value, this.maxCount);
    }
    if (this.minCount) {
      value = Decimal.max(value, this.minCount);
    }
    this.count = Decimal.fromValue_noAlloc(value);
    this.onChange?.(this.count, source);

    return this.count;
  }

  protected apply(
    rcs: ResourceCount<"resolved">[],
  ): ResourceCount<"resolved">[] {
    return Resource.combine(
      rcs
        .filter(({ resource }) => resource.name === this.name)
        .map(({ resource, count }) => {
          const prev = resource.count;
          const next = resource.setValue(resource.count.plus(count));
          return [{ resource, count: next.minus(prev) }];
        })
        .flat(),
    );
  }

  protected getPurchaseCost(
    amount: DecimalSource,
    style: PurchaseStyle,
    gainFactor: DecimalSource,
    costFactor: DecimalSource,
    countOverride?: DecimalSource,
  ): PurchaseCost<"resolved"> {
    if (Decimal.eq(amount, 0)) {
      return { count: Decimal.dZero, style, gain: [], cost: [] };
    }

    let start = this.getCount(countOverride);
    let target = start
      .plus(amount)
      .clamp(this.minCount ?? 0, this.maxCount ?? Infinity);

    if (style === "free") {
      const diff = target.minus(start);
      return {
        count: diff,
        style,
        gain: [{ resource: this, count: diff.mul(gainFactor) }],
        cost: [],
      };
    }

    if (start.gt(target)) {
      [start, target] = [target, start];
      [gainFactor, costFactor] = [
        Decimal.neg(gainFactor),
        Decimal.neg(costFactor).mul(Resource.globalSellRatio ?? 1),
      ];
    }

    let cost: ResourceCount<"resolved">[] = [];
    if (this.locked && this.unlockCost) {
      cost = Resource.resolveAll(this.unlockCost());
    }

    const s = start.floor().toNumber(),
      t = target.floor().toNumber();
    if (!isFinite(s) || !isFinite(t) || Math.abs(t - s) > 1000) {
      return { count: Decimal.dZero, style, gain: [], cost: [] };
    }

    let partialCount = 0;
    for (let i = s; i < t; i++) {
      const curCost = Resource.resolveAll(this.purchaseCost?.(i + 1) ?? []);
      curCost.forEach((rc) => (rc.count = Decimal.mul(rc.count, costFactor)));
      const partialCost = Resource.combine([...cost, ...curCost]);

      if (style.includes("partial") && !Resource.canAfford(partialCost)) {
        break;
      } else {
        partialCount++;
        cost = partialCost;
      }
    }

    if (
      (!style.includes("dry") && !Resource.canAfford(cost)) ||
      (style === "full" && partialCount !== t - s)
    ) {
      return { count: Decimal.dZero, style, gain: [], cost: [] };
    } else {
      return {
        count: Decimal.mul(partialCount, Decimal.sign(gainFactor)),
        style,
        gain: [
          { resource: this, count: Decimal.mul(gainFactor, partialCount) },
        ],
        cost,
      };
    }
  }

  protected getCount(override?: DecimalSource): Decimal {
    if (override != null) {
      if (typeof override === "string" && this.extra[override] != null) {
        return Decimal.fromValue_noAlloc(this.extra[override]);
      } else {
        return Decimal.fromValue_noAlloc(override);
      }
    } else {
      return this.count;
    }
  }

  protected static combine(
    rcs: ResourceCount<"resolved">[],
  ): ResourceCount<"resolved">[] {
    const res: Record<string, ResourceCount<"resolved">> = {};
    rcs.forEach(({ resource, count }) => {
      res[resource.name] ??= { resource, count: Decimal.dZero };
      res[resource.name].count = res[resource.name].count.add(count);
    });
    return Object.values(res).filter(({ count }) => count.neq(0));
  }

  private _rateLastTick: Decimal = Decimal.dZero;
  private _rateLastCount: number = 0;

  protected updateRate(dt: number) {
    this.lastTick = (this.lastTick ?? 0) + dt;
    if (!this._rateLastCount) {
      this._rateLastCount = dt;
      this._rateLastTick = this.count;
    }

    const delta = this.lastTick - this._rateLastCount;
    if (delta >= Resource.rateUpdateSecs) {
      const rate = this.count.sub(this._rateLastTick).div(delta);
      this.rate = this.rate
        .mul(1 - Resource.rateUpdateEMAFactor)
        .add(rate.mul(Resource.rateUpdateEMAFactor));
      this._rateLastCount = this.lastTick;
      this._rateLastTick = this.count;
    }
  }
}

export type DisplayStyle = "none" | "number" | "time" | "percentage";

export type PurchaseStyle =
  | "full"
  | "partial"
  | "free"
  | "dry-full"
  | "dry-partial";

export type PurchaseAmount =
  | DecimalSource
  | {
      minAmount: number;
      maxAmount: number;
      increments: number;
    };

export interface ResourceCount<
  Resolved extends "resolved" | "unresolved" = "resolved" | "unresolved",
> {
  resource: Resolved extends "resolved" ? Resource : Resource | string;
  count: Resolved extends "resolved" ? Decimal : DecimalSource;
}

export interface PurchaseCost<
  Resolved extends "resolved" | "unresolved" = "resolved" | "unresolved",
> {
  count: Resolved extends "resolved" ? Decimal : DecimalSource;
  style: PurchaseStyle;
  gain: ResourceCount<Resolved>[];
  cost: ResourceCount<Resolved>[];
}