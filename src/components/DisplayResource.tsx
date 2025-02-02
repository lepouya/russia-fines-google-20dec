import { ReactNode } from "react";

import { IonCol, IonRow } from "@ionic/react";

import Resource, { useResource } from "../model/Resource";
import className from "../utils/className";
import Icon from "./Icon";

export type DisplayResourceProps = {
  resource?: Partial<Resource> | string;
  override?: Partial<Resource>;

  epoch?: number;
  length?: "tiny" | "short" | "long";
  precision?: number;

  showLocked?: boolean;
  showIcon?: boolean;
  showName?: boolean;
  showValue?: boolean;
  showMaxValue?: boolean;
  showRate?: boolean;
  showExtras?: boolean;

  showColors?: boolean;
  showRateColors?: boolean;
  showNegatives?: boolean;
  showZeros?: boolean;
  showPlusSign?: boolean;
  showZeroRates?: boolean;
  showRatePercentages?: boolean;
  showCapitalized?: boolean;

  prefix?: string;
  suffix?: string;
  infix?: string;
  placeholder?: string;

  className?: string;
  style?: React.CSSProperties;
};

export default function DisplayResource(props: DisplayResourceProps) {
  const resource = useResource(props.resource);
  const fmt = resource.format({
    override: props.override,
    useRatePercent: props.showRatePercentages,
    len: props.length,
    prec: props.precision,
    alwaysShowSign: props.showPlusSign,
    epoch: props.epoch,
    capitalize: props.showCapitalized,
  });

  let cells: ReactNode[] = [];
  function addCell(
    cls: string | undefined = undefined,
    val: ReactNode = "",
    sign: "negative" | "zero" | "positive" | undefined = undefined,
    color = false,
    paren = false,
  ) {
    if (
      val &&
      ((props.showNegatives ?? true) || sign != "negative") &&
      ((props.showZeros ?? true) || sign != "zero")
    ) {
      let cellProps = { className: className(cls, sign) };
      cellProps = {
        ...cellProps,
        ..._size(_sizeFactors[props.length ?? "short"]),
      };
      if (color) {
        cellProps = { ...cellProps, ..._color(sign) };
      }
      cells.push(
        <IonCol key={`cell-${cells.length + 1}`} {...cellProps}>
          {paren ? typeof val === "string" ? `(${val})` : <>({val})</> : val}
        </IonCol>,
      );
    }
  }

  if (props.prefix) {
    addCell("prefix", props.prefix);
  }

  if (
    ((props.showIcon ?? true) && resource.icon) ||
    ((props.showName ?? true) && fmt.name)
  ) {
    addCell(
      "name",
      <>
        {(props.showIcon ?? true) && resource.icon && (
          <Icon icon={resource.icon} size="1em" />
        )}
        {(props.showName ?? true) && fmt.name}
        {((props.showValue ?? true) || props.showRate) && (props.infix ?? ":")}
      </>,
    );
  }

  if ((props.showValue ?? true) && fmt.value) {
    const denom = props.showMaxValue && fmt.max ? " / " + fmt.max : "";
    addCell("value", fmt.value + denom, fmt.valueSign, props.showColors);
  }

  if (
    props.showRate &&
    fmt.rate &&
    (props.showZeroRates || fmt.rateSign !== "zero")
  ) {
    addCell(
      "rate",
      fmt.rate,
      fmt.rateSign,
      props.showRateColors ?? true,
      props.showValue,
    );
  }

  if (props.showExtras && fmt.extras && Object.keys(fmt.extras).length > 0) {
    for (let k in fmt.extras) {
      if (!k || !fmt.extras[k]) {
        continue;
      }

      addCell(
        "extras",
        <>
          {k}
          {props.infix ?? ":"}
        </>,
      );
      addCell(fmt.extras[k]);
    }
  }

  const classNames = ["resource", resource.display, props.className];
  if (!props.showLocked && resource.locked) {
    classNames.push("locked");
    addCell("placeholder", props.placeholder);
  }

  if (props.suffix) {
    addCell("suffix", props.suffix);
  }

  return (
    <IonRow className={className(classNames)} style={props.style}>
      {cells}
    </IonRow>
  );
}

function _size(n: number = 1) {
  if (n <= 0) {
    return { size: "auto" };
  }
  return {
    sizeXl: `${Math.ceil(n * 2)}`, // >= 1200px
    sizeLg: `${Math.ceil(n * 2.5)}`, // >= 992px
    sizeMd: `${Math.ceil(n * 3)}`, // >= 768px
    sizeSm: `${Math.ceil(n * 4)}`, // >= 576px
    size: `${Math.ceil(n * 6)}`, // < 576px
  };
}

function _color(s?: "negative" | "zero" | "positive") {
  switch (s) {
    case "negative":
      return { color: "danger" };
    case "zero":
      return { color: "medium" };
    case "positive":
      return { color: "success" };
    default:
      return { color: "primary" };
  }
}

const _sizeFactors = {
  tiny: 0.5,
  short: 1,
  long: 1.5,
} as const;
