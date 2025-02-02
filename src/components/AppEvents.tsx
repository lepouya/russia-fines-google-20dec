import { useEffect } from "react";

import GameState from "../model/GameState";
import MainTab from "../pages/MainTab";
import SettingsTab from "../pages/SettingsTab";
import database from "../utils/database";
import shortcut from "../utils/shortcut";

export default function AppEvents() {
  const settings = GameState.useHook();

  useEffect(() => {
    shortcut.addEventListeners();
    database.initialize();
    return () => shortcut.removeEventListeners();
  }, []);

  useEffect(() => {
    GameState.addTickTimer();
    return () => GameState.removeTickTimer();
  }, [settings.ticksPerSec]);

  return null;
}

AppEvents.initialize = async function () {
  await database.initialize();
  await Promise.all([MainTab.init(), SettingsTab.init()]);
  await GameState.singleton.initAll();
  await GameState.load();
};
