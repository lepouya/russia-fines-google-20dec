// Inspired by github:antimatter-dimensions/notations

import Decimal, { DecimalSource } from "break_eternity.js";

export default class Notation {
  static readonly all: Record<string, Notation> = {};
  constructor(public readonly name: string) {
    if (Notation.all[name]) {
      return Notation.all[name];
    }
    Notation.all[name] = this;
  }

  static readonly exponentSettings = {
    prec: 3,
    commas: { show: true, min: 1e6, max: 1e9 },
  };

  static get(notation?: string | Notation) {
    return (
      (typeof notation === "string" ? Notation.all[notation] : notation) ??
      basicNotation
    );
  }

  infinite(): string {
    return Infinity.toString();
  }

  decimal(value: Decimal, prec?: number, exp?: number): string {
    return value.toStringWithDecimalPlaces(prec ?? exp ?? 0);
  }

  small(value: Decimal, prec?: number): string {
    return value.toNumber().toFixed(prec);
  }

  verySmall(value: Decimal, prec?: number): string {
    return this.small(value, prec);
  }

  negativeVerySmall(value: Decimal, prec?: number): string {
    return "-" + this.verySmall(value, prec);
  }

  negativeSmall(value: Decimal, prec?: number): string {
    return "-" + this.small(value, prec);
  }

  negativeDecimal(value: Decimal, prec?: number, exp?: number): string {
    return "-" + this.decimal(value, prec, exp);
  }

  negativeInfinite(): string {
    return "-" + this.infinite();
  }

  format(
    value: DecimalSource,
    basePrec = 0,
    exp = basePrec,
    smallPrec = 0,
  ): string {
    const decimal = Decimal.fromValue_noAlloc(value);
    if (!decimal.isFinite()) {
      return decimal.sign < 0 ? this.negativeInfinite() : this.infinite();
    } else if (decimal.exponent < -300) {
      return decimal.sign < 0
        ? this.negativeVerySmall(decimal.abs(), smallPrec)
        : this.verySmall(decimal, smallPrec);
    } else if (decimal.exponent < 3) {
      return decimal.sign < 0
        ? this.negativeSmall(decimal.abs(), smallPrec)
        : this.small(decimal, smallPrec);
    }
    return decimal.sign < 0
      ? this.negativeDecimal(decimal.abs(), basePrec, exp)
      : this.decimal(decimal, basePrec, exp);
  }
}
const basicNotation = new Notation("System");

class MixedNotation extends Notation {
  private readonly largeNotation: Notation;
  private readonly smallNotation: Notation;
  constructor(
    largeNotation?: Notation | string,
    smallNotation?: Notation | string,
  ) {
    super("Mixed " + Notation.get(largeNotation).name);
    this.largeNotation = Notation.get(largeNotation);
    this.smallNotation = Notation.get(smallNotation || "Standard");
  }

  decimal(v: Decimal, p?: number, e?: number) {
    return v.exponent < 33
      ? this.smallNotation.decimal(v, p, e)
      : this.largeNotation.decimal(v, p, e);
  }
}

abstract class CustomExponentNotation extends Notation {
  constructor(
    name: string,
    protected readonly steps: number,
    protected readonly base: number,
  ) {
    super(name);
  }

  abstract exponentFormatter(
    e: Decimal,
    prec?: number,
    expPrec?: number,
  ): string;

  decimal(n: Decimal, prec: number = 0, expPrec: number = 0): string {
    const realBase = this.base ** this.steps;
    let exponent = n.log(realBase).floor().mul(this.steps);
    if (this.base >= 100) {
      exponent = exponent.max(Decimal.dZero);
    }
    let m = n.div(exponent.pow_base(this.base)).toFixed(prec);
    if (m === realBase.toFixed(prec)) {
      m = (1).toFixed(prec);
      exponent = exponent.add(this.steps);
    }
    if (exponent.eq(Decimal.dZero)) {
      return m;
    }
    return (
      m +
      (this.base === 10 ? "e" : " ") +
      this.exponentFormatter(exponent, expPrec)
    );
  }
}

class StandardNotation extends CustomExponentNotation {
  private readonly abbrs = [
    ["K", "M", "B", "T", "Qa", "Qt", "Sx", "Sp", "Oc", "No"],
    ["", "U", "D", "T", "Qa", "Qt", "Sx", "Sp", "O", "N"],
    ["", "Dc", "Vg", "Tg", "Qd", "Qi", "Se", "St", "Og", "Nn"],
    ["", "Ce", "Dn", "Tc", "Qe", "Qu", "Sc", "Si", "Oe", "Ne"],
    ["", "MI-", "MC-", "NA-", "PC-", "FM-", "AT-", "ZP-"],
  ];

  exponentFormatter(rawExp: Decimal): string {
    const exp = rawExp.toNumber() - 1;
    if (exp === -1) {
      return "";
    } else if (exp > Notation.exponentSettings.commas.min) {
      return Infinity.toString();
    } else if (exp < this.abbrs[0].length) {
      return this.abbrs[0][exp];
    }
    const prefix = [];
    for (let e = exp; e > 0; e = Math.floor(e / 10)) {
      prefix.push(this.abbrs[1 + (prefix.length % 3)][e % 10]);
    }
    while (prefix.length % 3 !== 0) {
      prefix.push("");
    }
    let abbr = "";
    for (let i = prefix.length / 3 - 1; i >= 0; i--) {
      abbr += prefix.slice(i * 3, i * 3 + 3).join("") + this.abbrs[4][i];
    }
    return abbr
      .replace(/-[A-Z]{2}-/g, "-")
      .replace(/U([A-Z]{2}-)/g, "$1")
      .replace(/-$/, "");
  }
}
new StandardNotation("Standard", 1, 1000);

class ScientificNotation extends CustomExponentNotation {
  innerExpFormatter(n: number, _p: number): string {
    return n.toString();
  }

  exponentFormatter(
    e: Decimal,
    prec: number = Notation.exponentSettings.prec,
    expPrec: number = Math.max(2, prec),
  ): string {
    if (e.lt(Notation.exponentSettings.commas.min)) {
      return this.innerExpFormatter(e.toNumber(), Math.max(prec, 1));
    } else if (
      Notation.exponentSettings.commas.show &&
      e.lt(Notation.exponentSettings.commas.max)
    ) {
      const decimals = this.innerExpFormatter(e.toNumber(), 0).split(".");
      decimals[0] = decimals[0].replace(/\w+$/g, (v) =>
        Array.from(Array(Math.ceil(v.length / 3)))
          .map((_, i) => (i ? v.slice(-3 * (i + 1), -3 * i) : v.slice(-3)))
          .reverse()
          .join(","),
      );
      return decimals.join(".");
    }
    return this.decimal(e, expPrec, expPrec);
  }
}
new MixedNotation(new ScientificNotation("Scientific", 1, 10));
new MixedNotation(new ScientificNotation("Engineering", 3, 10));

class LogarithmicNotation extends ScientificNotation {
  innerExpFormatter(n: number, p: number): string {
    return n.toFixed(p);
  }

  decimal(v: Decimal, p?: number, e?: number) {
    return "e" + this.exponentFormatter(v.log10(), p, e);
  }
}
new MixedNotation(new LogarithmicNotation("Logarithmic", 1, 10));
