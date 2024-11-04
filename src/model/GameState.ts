import Decimal from "break_eternity.js";

import clamp from "../utils/clamp";
import database from "../utils/database";
import { FormatOptions } from "../utils/format";
import genRegistry from "../utils/registry";
import Resource from "./Resource";

export default class GameState {
  static singleton = new GameState();
  static registry = genRegistry(() => GameState.singleton);

  constructor(state?: Partial<GameState> | string) {
    GameState.singleton = this;
    Resource.globalSettings = this;
    this.load(state);
  }

  /// Simulation parameters

  ticksPerSec = 100;
  rendersPerSec = 30;
  saveFrequencySecs = 60;

  minUpdateSecs = 0.01;
  maxUpdateSecs = 24 * 60 * 60;
  maxTickSecs = 1;

  timeDilation = 1.0;
  simulationPaused = false;

  /// Execution information

  lastReset = Date.now();
  lastSaved = 0;
  lastLoaded = Date.now();
  lastRender = 0;
  lastTick?: number;

  onTickComplete?: (dt: number, source: string) => any;

  execution: Record<
    string,
    {
      lastTick: number;
      lastDelta: number;
      lastResult: Record<string, Decimal>;
      tps: number;
      fps: number;
    }
  > = {};

  /// Resource parameters

  resources: Record<string, Partial<Resource>> = Resource.ALL;

  formatOptions: Partial<FormatOptions> = {};

  gainFactor = 1;
  costFactor = 1;
  sellRatio = 1;

  rateUpdateSecs = 0.25;
  rateUpdateEMAFactor = 0.25;

  /////////////

  static set(state: Partial<GameState>) {
    return GameState.singleton.set(state);
  }

  static tick(now?: number, source?: string) {
    return GameState.singleton.tick(
      now,
      source,
      GameState.save,
      GameState.registry.signal,
    );
  }

  static async save() {
    GameState.singleton.tick(undefined, "save");
    const res = await database.write("Settings", GameState.singleton.save());
    return res;
  }

  static async load() {
    GameState.singleton.load(await database.read("Settings"));
    GameState.singleton.tick(undefined, "load");
    return GameState.singleton;
  }

  static reset(settings?: Partial<GameState>) {
    GameState.singleton = new GameState(settings);
    return GameState.singleton;
  }

  /////////////

  private timer: NodeJS.Timeout | null = null;

  static addTickTimer() {
    GameState.removeTickTimer();
    const newTimerId = setInterval(
      () => GameState.tick(undefined, "tick"),
      1000.0 / GameState.singleton.ticksPerSec,
    );
    GameState.singleton.timer = newTimerId;
  }

  static removeTickTimer() {
    if (GameState.singleton.timer) {
      clearInterval(GameState.singleton.timer);
    }
    GameState.singleton.timer = null;
  }

  /////////////

  set(state: Partial<GameState>): this {
    let k: keyof GameState;
    for (k in state) {
      if (state[k] == undefined || state[k] == null) {
        continue;
      } else if (k === "resources") {
        Resource.loadAll(state.resources || {});
      } else if (typeof this[k] === "object" && typeof state[k] === "object") {
        Object.assign((this as any)[k], state[k]);
      } else {
        (this as any)[k] = state[k];
      }
    }

    GameState.registry.signal();
    return this;
  }

  load(state?: Partial<GameState> | string): this {
    if (typeof state === "string") {
      return this.load(JSON.parse(state));
    } else if (!state) {
      state = {};
    } else if (typeof state !== "object") {
      return this;
    }

    this.set(state);
    this.lastLoaded = Date.now();
    GameState.registry.signal();
    return this;
  }

  save(): Partial<GameState> {
    this.lastSaved = Date.now();
    GameState.registry.signal();

    return { ...this, resources: Resource.saveAll() };
  }

  tick(
    now: number = Date.now(),
    source: string = "unknown",
    onSave?: (settings?: this) => void,
    onRender?: (settings?: this) => void,
  ): Record<string, Decimal> {
    // Figure out how long it's been since last tick
    const lastTick = this.lastTick ?? now;
    let dt = clamp((now - lastTick) / 1000, 0, this.maxUpdateSecs);
    const epoch = now - dt * 1000;
    if (dt < this.minUpdateSecs && this.lastTick != undefined) {
      return {};
    }

    // tick all sources
    let results: Record<string, Decimal> = {};
    const tickScale = 1 / this.timeDilation;
    const tps = [dt, 1];
    while (dt > 0) {
      const tick = clamp(dt, this.minUpdateSecs, this.maxTickSecs);
      // tps[1]++;
      dt -= tick;
      results = Resource.tickAll(
        this.simulationPaused ? 0 : tick * tickScale,
        source,
        results,
      );

      if (source === "tick") {
        this.tickAll(this.simulationPaused ? 0 : tick * tickScale);
      }
    }

    const ema = Resource.globalSettings.rateUpdateEMAFactor || 0.25;

    // Update execution status
    this.lastTick = now;
    this.execution[source] = {
      lastTick: now,
      lastDelta: (now - epoch) / 1000,
      lastResult: results,
      tps:
        (this.execution[source]?.tps || 0) * (1 - ema) +
        (tps[1] / tps[0]) * ema,
      fps: this.execution[source]?.fps || 0,
    };

    // Call the onUpdateComplete callback
    if (this.onTickComplete) {
      this.onTickComplete((now - epoch) / 1000, source);
    }

    // Callbacks for save and render in main loop
    if (
      onSave &&
      this.lastTick - this.lastSaved >= this.saveFrequencySecs * 1000 &&
      this.lastTick - this.lastLoaded >= this.saveFrequencySecs * 1000
    ) {
      this.lastSaved = this.lastTick;
      onSave(this);
    }

    if (
      onRender &&
      this.lastTick - this.lastRender >= 1000.0 / this.rendersPerSec
    ) {
      this.execution[source].fps =
        (this.execution[source].fps || 0) * (1 - ema) +
        (1000.0 / (this.lastTick - this.lastRender)) * ema;
      this.lastRender = this.lastTick;
      onRender(this);
    }

    return this.execution[source].lastResult;
  }

  /////////////

  async initAll() {
    // Initialization actions here
  }

  tickAll(dt: number) {
    // Tick actions here
    return dt;
  }
}

export function useGameState() {
  return GameState.registry.useHook();
}
