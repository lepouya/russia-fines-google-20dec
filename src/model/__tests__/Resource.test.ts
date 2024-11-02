import Decimal, { DecimalSource } from "break_eternity.js";
import { describe, expect, test } from "vitest";

import Resource from "../Resource";

const D = Decimal.fromValue;
const N = (n?: DecimalSource) => (n ? D(n).toNumber() : undefined);

describe("Creating resources", () => {
  test("Empty resource manager set up correctly", () => {
    Resource.reset();
    const keys = Object.keys(Resource.ALL);
    expect(keys).to.deep.equal([]);
  });

  test("Creating new resource works", () => {
    Resource.reset();
    const R1 = Resource.upsert({ name: "test1" });

    expect(Resource.get("test1")).to.equal(R1);
    expect(Resource.get("test1").name).to.equal("test1");
  });

  test("Adding multiple fields", () => {
    Resource.reset();
    const R1 = Resource.upsert({ name: "test1", count: D(5), maxCount: D(1) });
    const R2 = Resource.upsert({ name: "test2", extra: { bonus: 1 } });

    expect(Resource.ALL["test1"]).to.equal(R1);
    expect(Resource.ALL["test1"].name).to.equal("test1");
    expect(N(Resource.ALL["test1"].count)).to.be.approximately(5, 0.001);
    expect(Resource.ALL["test1"].extra["bonus"]).to.be.undefined;
    expect(N(Resource.ALL["test1"].maxCount)).to.be.approximately(1, 0.001);

    expect(Resource.ALL["test2"]).to.equal(R2);
    expect(Resource.ALL["test2"].name).to.equal("test2");
    expect(N(Resource.ALL["test2"].count)).to.be.approximately(0, 0.001);
    expect(Resource.ALL["test2"].extra["bonus"]).to.be.approximately(1, 0.001);
    expect(Resource.ALL["test2"].extra["auto"]).to.be.undefined;
    expect(Resource.ALL["test2"].maxCount).to.be.undefined;
  });

  test("Overwriting fields", () => {
    Resource.reset();
    const R1 = Resource.upsert({ name: "test1", count: D(5) });
    const R2 = Resource.upsert({
      name: "test1",
      extra: { auto: 7 },
      maxCount: D(1),
    });

    expect(Resource.ALL["test1"]).to.equal(R1);
    expect(Resource.ALL["test1"]).to.equal(R2);
    expect(Resource.ALL["test1"].name).to.equal("test1");
    expect(N(Resource.ALL["test1"].count)).to.be.approximately(5, 0.001);
    expect(Resource.ALL["test1"].extra["auto"]).to.be.approximately(7, 0.001);
    expect(N(Resource.ALL["test1"].maxCount)).to.be.approximately(1, 0.001);
  });
});

describe("Updating resources", () => {
  test("Time is updated correctly", () => {
    Resource.reset();
    const R1 = Resource.upsert({ name: "test1" });
    R1.lastTick = 1000;

    Resource.tickAll(1000);
    expect(R1.lastTick).to.be.equal(2000);

    Resource.tickAll(1000);
    expect(R1.lastTick).to.be.equal(3000);
  });

  test("Resource ticks called corectly", () => {
    Resource.reset();

    const R1 = Resource.upsert({
      name: "test1",
      onTick(dt) {
        Resource.get("test1").count = Resource.get("test1").count.plus(dt);
      },
    });
    const R2 = Resource.upsert({
      name: "test2",
      onTick() {
        Resource.get("test2").count = Resource.get("test2").count.add(1);
      },
    });

    Resource.tickAll(0.5);
    expect(R1.lastTick).to.be.equal(0.5);
    expect(N(Resource.ALL["test1"].count)).to.be.equal(0.5);
    expect(N(Resource.ALL["test2"].count)).to.be.equal(1);

    Resource.tickAll(1);
    expect(R2.lastTick).to.be.equal(1.5);
    expect(N(Resource.ALL["test1"].count)).to.be.equal(1.5);
    expect(N(Resource.ALL["test2"].count)).to.be.equal(2);
  });

  test("Rate update works", () => {
    Resource.reset();

    Resource.upsert({
      name: "test1",
      onTick(dt) {
        Resource.get("test1").count = Resource.get("test1").count.plus(dt);
      },
    });
    Resource.upsert({
      name: "test2",
      onTick: () =>
        (Resource.get("test2").count = Resource.get("test2").count.plus(
          Resource.get("test1").count,
        )),
    });

    Resource.tickAll(1);
    expect(N(Resource.ALL["test1"].count)).to.be.equal(1);
    expect(N(Resource.ALL["test2"].count)).to.be.equal(1);

    Resource.tickAll(1);
    expect(N(Resource.ALL["test1"].count)).to.be.equal(2);
    expect(N(Resource.ALL["test1"].rate)).to.be.greaterThan(0);
    expect(N(Resource.ALL["test2"].count)).to.be.equal(3);
    expect(N(Resource.ALL["test2"].rate)).to.be.greaterThan(0);

    const oldRate1 = N(Resource.ALL["test1"].rate) ?? 0;
    const oldRate2 = N(Resource.ALL["test2"].rate) ?? 0;

    Resource.tickAll(1);
    Resource.tickAll(1);
    Resource.tickAll(1);
    expect(N(Resource.ALL["test1"].count)).to.be.equal(5);
    expect(N(Resource.ALL["test1"].rate)).to.be.greaterThan(oldRate1);
    expect(N(Resource.ALL["test2"].count)).to.be.equal(15);
    expect(N(Resource.ALL["test2"].rate)).to.be.greaterThan(oldRate2);
  });
});

describe("Purchasing", () => {
  test("Simple purchases", () => {
    Resource.reset();
    const r1 = Resource.upsert({ name: "r1", count: D(10) });
    const r2 = Resource.upsert({ name: "r2", count: D(0) });
    r2.purchaseCost = () => [{ resource: "r1", count: D(1) }];

    Resource.purchase([{ resource: "r2", count: D(1) }]);
    expect(N(r1.count)).to.be.approximately(9, 0.001);
    expect(N(r2.count)).to.be.approximately(1, 0.001);

    Resource.purchase([{ resource: "r2", count: D(4) }]);
    expect(N(r1.count)).to.be.approximately(5, 0.001);
    expect(N(r2.count)).to.be.approximately(5, 0.001);
  });

  test("Full purchases", () => {
    Resource.reset();
    const r1 = Resource.upsert({ name: "r1", count: D(10) });
    const r2 = Resource.upsert({ name: "r2", count: D(0) });
    r2.purchaseCost = () => [{ resource: "r1", count: D(1) }];

    Resource.purchase([{ resource: "r2", count: D(3) }], "full");
    expect(N(r1.count)).to.be.approximately(7, 0.001);
    expect(N(r2.count)).to.be.approximately(3, 0.001);

    Resource.purchase([{ resource: "r2", count: D(4) }], "full");
    expect(N(r1.count)).to.be.approximately(3, 0.001);
    expect(N(r2.count)).to.be.approximately(7, 0.001);

    Resource.purchase([{ resource: "r2", count: D(5) }], "full");
    expect(N(r1.count)).to.be.approximately(3, 0.001);
    expect(N(r2.count)).to.be.approximately(7, 0.001);
  });

  test("Partial purchases", () => {
    Resource.reset();
    const r1 = Resource.upsert({ name: "r1", count: D(10) });
    const r2 = Resource.upsert({ name: "r2", count: D(0) });
    r2.purchaseCost = () => [{ resource: "r1", count: D(1) }];

    Resource.purchase([{ resource: "r2", count: D(3) }], "partial");
    expect(N(r1.count)).to.be.approximately(7, 0.001);
    expect(N(r2.count)).to.be.approximately(3, 0.001);

    Resource.purchase([{ resource: "r2", count: D(4) }], "partial");
    expect(N(r1.count)).to.be.approximately(3, 0.001);
    expect(N(r2.count)).to.be.approximately(7, 0.001);

    Resource.purchase([{ resource: "r2", count: D(5) }], "partial");
    expect(N(r1.count)).to.be.approximately(0, 0.001);
    expect(N(r2.count)).to.be.approximately(10, 0.001);
  });

  test("Free purchases", () => {
    Resource.reset();
    const r1 = Resource.upsert({ name: "r1", count: D(10) });
    const r2 = Resource.upsert({ name: "r2", count: D(0) });
    r2.purchaseCost = () => [{ resource: "r1", count: D(1) }];

    Resource.purchase([{ resource: "r2", count: D(3) }], "free");
    expect(N(r1.count)).to.be.approximately(10, 0.001);
    expect(N(r2.count)).to.be.approximately(3, 0.001);
  });

  test("Locked purchases", () => {
    Resource.reset();
    const r1 = Resource.upsert({ name: "r1", count: D(10) });
    const r2 = Resource.upsert({ name: "r2", count: D(0) });
    r2.purchaseCost = () => [{ resource: "r1", count: D(1) }];
    r2.locked = true;

    Resource.purchase([{ resource: "r2", count: D(3) }]);
    expect(N(r1.count)).to.be.approximately(10, 0.001);
    expect(N(r2.count)).to.be.approximately(0, 0.001);

    r1.locked = true;
    r2.locked = false;

    Resource.purchase([{ resource: "r2", count: D(3) }]);
    expect(N(r1.count)).to.be.approximately(10, 0.001);
    expect(N(r2.count)).to.be.approximately(0, 0.001);

    r1.locked = false;

    Resource.purchase([{ resource: "r2", count: D(3) }]);
    expect(N(r1.count)).to.be.approximately(7, 0.001);
    expect(N(r2.count)).to.be.approximately(3, 0.001);
  });

  test("Complex purchases", () => {
    Resource.reset();
    const r1 = Resource.upsert({ name: "r1", count: D(100) });
    const r2 = Resource.upsert({ name: "r2", count: D(20) });
    const r3 = Resource.upsert({ name: "r3", count: D(0) });
    r3.purchaseCost = (n) => [
      { resource: "r1", count: D(n).pow(2) },
      { resource: "r2", count: n },
    ];

    Resource.purchase([{ resource: "r3", count: D(1) }]);
    expect(N(r1.count)).to.be.approximately(99, 0.001);
    expect(N(r2.count)).to.be.approximately(19, 0.001);
    expect(N(r3.count)).to.be.approximately(1, 0.001);

    Resource.purchase([{ resource: "r3", count: D(1) }]);
    expect(N(r1.count)).to.be.approximately(95, 0.001);
    expect(N(r2.count)).to.be.approximately(17, 0.001);
    expect(N(r3.count)).to.be.approximately(2, 0.001);

    Resource.purchase([{ resource: "r3", count: D(2) }]);
    expect(N(r1.count)).to.be.approximately(70, 0.001);
    expect(N(r2.count)).to.be.approximately(10, 0.001);
    expect(N(r3.count)).to.be.approximately(4, 0.001);

    Resource.purchase([{ resource: "r3", count: D(2) }], "full");
    expect(N(r1.count)).to.be.approximately(70, 0.001);
    expect(N(r2.count)).to.be.approximately(10, 0.001);
    expect(N(r3.count)).to.be.approximately(4, 0.001);

    Resource.purchase([{ resource: "r3", count: D(2) }], "partial");
    expect(N(r1.count)).to.be.approximately(45, 0.001);
    expect(N(r2.count)).to.be.approximately(5, 0.001);
    expect(N(r3.count)).to.be.approximately(5, 0.001);

    Resource.purchase([{ resource: "r3", count: D(2) }], "free");
    expect(N(r1.count)).to.be.approximately(45, 0.001);
    expect(N(r2.count)).to.be.approximately(5, 0.001);
    expect(N(r3.count)).to.be.approximately(7, 0.001);
  });

  test("Multiple purchases", () => {
    Resource.reset();
    const r1 = Resource.upsert({
      name: "r1",
      count: D(100),
      extra: { auto: 10 },
    });
    const r2 = Resource.upsert({ name: "r2", count: D(20) });
    const r3 = Resource.upsert({ name: "r3", count: D(0) });
    r2.purchaseCost = (n) => [{ resource: "r1", count: n }];
    r3.purchaseCost = (n) => [
      { resource: "r1", count: D(n).pow(2) },
      { resource: "r2", count: n },
    ];

    Resource.purchase([{ resource: "r3", count: D(1) }]);
    expect(N(r1.count)).to.be.approximately(99, 0.001);
    expect(r1.extra["auto"]).to.be.approximately(10, 0.001);
    expect(N(r2.count)).to.be.approximately(19, 0.001);
    expect(N(r3.count)).to.be.approximately(1, 0.001);

    Resource.purchase([{ resource: "r2", count: D(1) }]);
    expect(N(r1.count)).to.be.approximately(79, 0.001);
    expect(N(r2.count)).to.be.approximately(20, 0.001);
    expect(N(r3.count)).to.be.approximately(1, 0.001);

    Resource.purchase([
      { resource: "r3", count: D(2) },
      { resource: "r2", count: D(2) },
    ]);
    expect(N(r1.count)).to.be.approximately(33, 0.001);
    expect(N(r2.count)).to.be.approximately(17, 0.001);
    expect(N(r3.count)).to.be.approximately(3, 0.001);
  });

  test("Dry purchases", () => {
    Resource.reset();
    const r1 = Resource.upsert({
      name: "r1",
      count: D(100),
      extra: { auto: 10 },
    });
    const r2 = Resource.upsert({ name: "r2", count: D(20) });
    const r3 = Resource.upsert({ name: "r3", count: D(0) });
    r2.purchaseCost = (n) => [
      { resource: "r1", count: n },
      { resource: "r1", count: D(1) },
    ];
    r3.purchaseCost = (n) => [
      { resource: "r1", count: D(n).pow(2) },
      { resource: "r2", count: n },
    ];

    let canBuy = Resource.purchase(
      [{ resource: "r3", count: D(1) }],
      "dry-full",
    );
    expect(N(r1.count)).to.be.approximately(100, 0.001);
    expect(r1.extra["auto"]).to.be.approximately(10, 0.001);
    expect(N(r2.count)).to.be.approximately(20, 0.001);
    expect(N(r3.count)).to.be.approximately(0, 0.001);
    expect(canBuy.gain).to.deep.equal([{ resource: r3, count: D(1) }]);

    canBuy = Resource.purchase([{ resource: "r2", count: D(1) }], "dry-full");
    expect(N(r1.count)).to.be.approximately(100, 0.001);
    expect(r1.extra["auto"]).to.be.approximately(10, 0.001);
    expect(N(r2.count)).to.be.approximately(20, 0.001);
    expect(N(r3.count)).to.be.approximately(0, 0.001);
    expect(canBuy.gain).to.deep.equal([{ resource: r2, count: D(1) }]);

    canBuy = Resource.purchase(
      [
        { resource: r3, count: D(10) },
        { resource: "r2", count: D(10) },
      ],
      "dry-partial",
    );
    expect(canBuy.gain).to.deep.equal([
      { resource: r3, count: D(5) },
      { resource: r2, count: D(4) },
    ]);
  });
});

describe("ResourceHelper", () => {
  test("Helper methods", () => {
    Resource.reset();
    const r1 = Resource.upsert({
      name: "r1",
      count: D(100),
      extra: { auto: 10 },
    });
    const r2 = Resource.upsert({ name: "r2", count: D(20) });
    const r3 = Resource.upsert({ name: "r3", count: D(0) });
    const r1value = () =>
      N(Object.values(r1.extra).reduce((s, c) => s.plus(c), r1.count));
    r2.purchaseCost = (n) => [
      { resource: "r1", count: n },
      { resource: "r1", count: D(1) },
    ];
    r3.purchaseCost = (n) => [
      { resource: "r1", count: D(n).pow(2) },
      { resource: "r2", count: n },
    ];

    expect(r1value()).to.be.approximately(110, 0.001);
    expect(Resource.get("r1").extra["auto"]).to.be.approximately(10, 0.001);
    expect(N(Resource.get("r2").count)).to.be.approximately(20, 0.001);
    expect(N(Resource.get(r3).count)).to.be.approximately(0, 0.001);

    expect(N(Resource.get("r3").canBuy().count)).to.be.approximately(1, 0.001);
    expect(N(Resource.get("r2").canBuy(D(1)).count)).to.be.approximately(
      1,
      0.001,
    );
    expect(N(Resource.get(r3).canBuy(D(10)).count)).to.be.approximately(
      5,
      0.001,
    );
    expect(N(Resource.get(r2).canBuy(D(10)).count)).to.be.approximately(
      4,
      0.001,
    );

    expect(N(Resource.get(r1).award(D(3)).count)).to.be.approximately(3, 0.001);
    expect(r1value()).to.be.approximately(113, 0.001);
    expect(N(Resource.get(r1).count)).to.be.approximately(103, 0.001);
    expect(Resource.get(r1).extra["auto"]).to.be.approximately(10, 0.001);

    expect(N(Resource.get(r3).award(D(10)).count)).to.be.approximately(
      10,
      0.001,
    );
    expect(r1value()).to.be.approximately(113, 0.001);
    expect(N(Resource.get(r2).count)).to.be.approximately(20, 0.001);
    expect(N(Resource.get(r3).count)).to.be.approximately(10, 0.001);

    r1.count = D(100);
    r3.count = D(0);

    expect(N(Resource.get(r3).buy().count)).to.be.approximately(1, 0.001);
    expect(N(r1.count)).to.be.approximately(99, 0.001);
    expect(r1.extra["auto"]).to.be.approximately(10, 0.001);
    expect(N(r2.count)).to.be.approximately(19, 0.001);
    expect(N(r3.count)).to.be.approximately(1, 0.001);

    expect(N(Resource.get(r2).buy(D(1)).count)).to.be.approximately(1, 0.001);
    expect(N(r1.count)).to.be.approximately(78, 0.001);
    expect(N(r2.count)).to.be.approximately(20, 0.001);
    expect(N(r3.count)).to.be.approximately(1, 0.001);

    expect(N(Resource.get(r3).buy(D(2)).count)).to.be.approximately(2, 0.001);
    expect(N(Resource.get(r2).buy(D(2)).count)).to.be.approximately(2, 0.001);
    expect(N(r1.count)).to.be.approximately(30, 0.001);
    expect(N(r2.count)).to.be.approximately(17, 0.001);
    expect(N(r3.count)).to.be.approximately(3, 0.001);
  });
});

describe("Gain and cost multipliers", () => {
  test("Simple multipliers", () => {
    Resource.reset();
    const r1 = Resource.upsert({ name: "r1", count: D(10) });
    const r2 = Resource.upsert({ name: "r2", count: D(0) });
    r2.purchaseCost = () => [{ resource: "r1", count: D(1) }];

    Resource.purchase([{ resource: "r2", count: D(1) }]);
    expect(N(r1.count)).to.be.approximately(9, 0.001);
    expect(N(r2.count)).to.be.approximately(1, 0.001);

    Resource.purchase([{ resource: "r2", count: D(2) }], undefined, D(2), D(1));
    expect(N(r1.count)).to.be.approximately(7, 0.001);
    expect(N(r2.count)).to.be.approximately(5, 0.001);

    Resource.purchase([{ resource: "r2", count: D(2) }], undefined, D(1), D(2));
    expect(N(r1.count)).to.be.approximately(3, 0.001);
    expect(N(r2.count)).to.be.approximately(7, 0.001);
  });

  test("More complicated multipliers", () => {
    Resource.reset();
    const r1 = Resource.upsert({ name: "r1", count: D(100) });
    const r2 = Resource.upsert({ name: "r2", count: D(20) });
    const r3 = Resource.upsert({ name: "r3", count: D(0) });
    r3.purchaseCost = (n) => [
      { resource: "r1", count: D(n).pow(2) },
      { resource: "r2", count: n },
    ];

    Resource.purchase([{ resource: "r3", count: D(1) }], "full", D(10), D(2));
    expect(N(r1.count)).to.be.approximately(98, 0.001);
    expect(N(r2.count)).to.be.approximately(18, 0.001);
    expect(N(r3.count)).to.be.approximately(10, 0.001);

    Resource.purchase(
      [{ resource: "r3", count: D(1) }],
      "partial",
      D(2),
      D(0.1),
    );
    expect(N(r1.count)).to.equal(85.9);
    expect(N(r2.count)).to.equal(16.9);
    expect(N(r3.count)).to.be.approximately(12, 0.001);

    Resource.purchase(
      [{ resource: "r3", count: D(3) }],
      "partial",
      D(0.5),
      D(0.5),
    );
    expect(N(r1.count)).to.be.approximately(1.4, 0.001);
    expect(N(r2.count)).to.be.approximately(10.4, 0.001);
    expect(N(r3.count)).to.be.approximately(12.5, 0.001);
  });
});

describe("Resource selling", () => {
  test("Simple buy and sell", () => {
    Resource.reset();
    const r1 = Resource.upsert({ name: "r1", count: D(10) });
    const r2 = Resource.upsert({ name: "r2", count: D(0) });
    r2.purchaseCost = () => [{ resource: "r1", count: D(1) }];

    Resource.purchase([{ resource: "r2", count: D(1) }]);
    expect(N(r1.count)).to.be.approximately(9, 0.001);
    expect(N(r2.count)).to.be.approximately(1, 0.001);

    Resource.purchase([{ resource: "r2", count: D(2) }]);
    expect(N(r1.count)).to.be.approximately(7, 0.001);
    expect(N(r2.count)).to.be.approximately(3, 0.001);

    Resource.purchase([{ resource: "r2", count: D(-1) }]);
    expect(N(r1.count)).to.be.approximately(8, 0.001);
    expect(N(r2.count)).to.be.approximately(2, 0.001);

    Resource.purchase([{ resource: "r2", count: D(-2) }]);
    expect(N(r1.count)).to.be.approximately(10, 0.001);
    expect(N(r2.count)).to.be.approximately(0, 0.001);

    Resource.purchase([{ resource: "r2", count: D(1) }]);
    expect(N(r1.count)).to.be.approximately(9, 0.001);
    expect(N(r2.count)).to.be.approximately(1, 0.001);

    Resource.purchase([{ resource: "r2", count: D(-2) }]);
    expect(N(r1.count)).to.be.approximately(10, 0.001);
    expect(N(r2.count)).to.be.approximately(0, 0.001);
  });

  test("Complex selling", () => {
    Resource.reset();
    const r1 = Resource.upsert({ name: "r1", count: D(100), minCount: D(80) });
    const r2 = Resource.upsert({ name: "r2", count: D(20) });
    const r3 = Resource.upsert({ name: "r3", count: D(0), maxCount: D(5) });
    r3.purchaseCost = (n) => [
      { resource: "r1", count: D(n).pow(2) },
      { resource: "r2", count: n },
    ];

    Resource.purchase([{ resource: "r3", count: D(1) }]);
    expect(N(r1.count)).to.be.approximately(99, 0.001);
    expect(N(r2.count)).to.be.approximately(19, 0.001);
    expect(N(r3.count)).to.be.approximately(1, 0.001);

    Resource.purchase([{ resource: "r3", count: D(2) }]);
    expect(N(r1.count)).to.be.approximately(86, 0.001);
    expect(N(r2.count)).to.be.approximately(14, 0.001);
    expect(N(r3.count)).to.be.approximately(3, 0.001);

    Resource.purchase([{ resource: "r3", count: D(2) }]);
    expect(N(r1.count)).to.be.approximately(86, 0.001);
    expect(N(r2.count)).to.be.approximately(14, 0.001);
    expect(N(r3.count)).to.be.approximately(3, 0.001);

    Resource.purchase([{ resource: "r3", count: D(-1) }]);
    expect(N(r1.count)).to.be.approximately(95, 0.001);
    expect(N(r2.count)).to.be.approximately(17, 0.001);
    expect(N(r3.count)).to.be.approximately(2, 0.001);

    Resource.purchase([{ resource: "r3", count: D(-5) }]);
    expect(N(r1.count)).to.be.approximately(100, 0.001);
    expect(N(r2.count)).to.be.approximately(20, 0.001);
    expect(N(r3.count)).to.be.approximately(0, 0.001);
  });
});
