import Decimal, { DecimalSource } from "break_eternity.js";
import React from "react";

import { IonButton } from "@ionic/react";

import GameState from "../model/GameState";
import Resource, { ResourceCount, useResource } from "../model/Resource";
import className from "../utils/className";
import Icon from "./Icon";

export type BuyButtonProps = {
  resource?: Partial<Resource> | string;

  enabled?: boolean;
  allowUnlocking?: boolean;
  mode?: "buy" | "sell";

  maxNum?: number;
  minNum?: number;
  increment?: number;
  precision?: number;
  buyAmount?: string;

  gainFactor?: DecimalSource;
  costFactor?: DecimalSource;
  countOverride?: DecimalSource;

  prefix?: string;
  suffix?: string;
  infix?: string;
  and?: string;

  className?: string;
  style?: React.CSSProperties;
  debug?: boolean;

  onPurchase?: (resource: Resource, bought: DecimalSource) => void;
};

export default function BuyButton(props: BuyButtonProps) {
  const resource = useResource(props.resource);
  const buyAmount =
    _buyAmounts[props.buyAmount ?? GameState.singleton.buyAmount ?? "+1"] ??
    _buyAmounts["+1"];
  const amount = {
    minAmount: props.minNum ?? buyAmount.min,
    maxAmount: props.maxNum ?? buyAmount.max,
    increments: props.increment ?? buyAmount.inc,
  };
  let enabled = props.enabled ?? true;

  if (resource.locked) {
    if (props.allowUnlocking) {
      amount.minAmount = amount.maxAmount = amount.increments = 1;
    } else {
      amount.minAmount = amount.maxAmount = amount.increments = 0;
      enabled = false;
    }
  }

  function renderResourceCounts(rcs: ResourceCount[], factor = 1) {
    return rcs.map(({ resource, count }, i) => {
      const res = Resource.get(resource).format({
        override: { count: Decimal.mul(count, factor) },
        prec: props.precision ?? 0,
        alwaysShowSign: true,
      });
      return (
        <div className="resource" key={res.name}>
          {i > 0 && <div className="prefix">{props.and ?? "&"}</div>}
          <div className={res.valueSign}>{res.value}</div>
          <div>
            {res.icon && <Icon icon={res.icon} size="1em" />}
            {res.name}
          </div>
        </div>
      );
    });
  }

  function doPurchase(amount: DecimalSource, event: React.UIEvent) {
    event.preventDefault();
    if (!enabled || Decimal.eq(amount, 0)) {
      return;
    }

    const bought = resource.buy(
      amount,
      "partial",
      props.gainFactor,
      props.costFactor,
      props.countOverride,
    );

    if (props.onPurchase && bought.gain.length > 0) {
      props.onPurchase(resource, bought.gain[0].count);
    }
  }

  const tx =
    props.mode === "sell"
      ? resource.sell(
          amount,
          "dry-full",
          1,
          props.costFactor,
          props.countOverride,
        )
      : resource.buy(
          amount,
          "dry-partial",
          props.gainFactor,
          props.costFactor,
          props.countOverride,
        );
  const active = Resource.canAfford(tx.cost);
  const hasGain = tx.gain.some(({ count }) => Decimal.neq(count, 0));
  const hasCost = tx.cost.some(({ count }) => Decimal.neq(count, 0));
  const classNames = [props.className, "buy-button", active || "inactive"];
  const prefix = props.prefix ?? "Buy";
  const suffix = props.suffix ?? "";
  const infix = props.infix ?? "for";

  if (!hasGain && !props.debug) {
    return null;
  }
  return (
    <IonButton
      onClick={(e) => doPurchase(active && enabled ? tx.count : 0, e)}
      disabled={!active || !enabled}
      className={className(classNames)}
      style={props.style}
      id={`button-buy-${resource.name}`}
    >
      {prefix && <div className="prefix">{prefix}</div>}
      {renderResourceCounts(tx.gain)}
      {hasCost && enabled && infix && <div className="infix">{infix}</div>}
      {hasCost && enabled && renderResourceCounts(tx.cost, -1)}
      {suffix && <div className="suffix">{suffix}</div>}
      {props.debug && (
        <div className="full debug">
          {JSON.stringify(tx, (k, v) => (k === "resource" ? v.name : v), 2)}
        </div>
      )}
    </IonButton>
  );
}

const _buyAmounts: Record<string, { min: number; max: number; inc: number }> = {
  "+1": { min: 1, max: 1, inc: 1 },
  x10: { min: 1, max: 10, inc: 10 },
  x100: { min: 1, max: 100, inc: 100 },
  "+10": { min: 10, max: 10, inc: 1 },
  "+100": { min: 100, max: 100, inc: 1 },
  max: { min: 1, max: 1000, inc: 1 },
};
