import { createBrowserHistory } from "history";
import { useEffect, useState } from "react";

import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCheckbox,
  IonCol,
  IonGrid,
  IonLabel,
  IonRange,
  IonRow,
  IonText,
  IonTextarea,
} from "@ionic/react";

import TabApp from "../components/TabApp";
import GameState, { useGameState } from "../model/GameState";
import { decode, encode } from "../utils/codec";
import database from "../utils/database";
import format from "../utils/format";
import Notation from "../utils/notation";

export default function SettingsTab() {
  const debug = isDebug();

  return (
    <IonGrid>
      <AppDataPanel />
      <NumberFormatPanel />
      <AdvancedPanel />
      <ResetPanel />
      {debug && <DebugPanel />}
    </IonGrid>
  );
}

SettingsTab.init = () => {
  TabApp.register({
    path: "settings",
    content: <SettingsTab />,
    icon: "settingsOutline",
    label: "Settings",
    title: "Settings",
  });
};

function AppDataPanel() {
  const settings = useGameState();
  const [textContents, setTextContents] = useState("");
  const debug = true; // Useful for now

  return (
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>
          <IonRow>
            <IonCol size="12" className="ion-text-center">
              <IonText>Data</IonText>
            </IonCol>
          </IonRow>
        </IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <IonRow>
          <IonCol size="12">
            Started{" "}
            {format.time(settings.lastTick ?? 0, { epoch: settings.lastReset })}
          </IonCol>
          <IonCol size="12">
            This session started{" "}
            {format.time(settings.lastTick ?? 0, {
              epoch: settings.lastLoaded,
            })}
          </IonCol>
          <IonCol size="12">
            Last saved{" "}
            {format.time(settings.lastTick ?? 0, { epoch: settings.lastSaved })}
          </IonCol>
        </IonRow>
        <IonRow>
          <IonCol size="6">
            <IonButton
              onClick={() => {
                GameState.load()
                  .then(() => GameState.save())
                  .then(reload);
              }}
              expand="block"
            >
              Load
            </IonButton>
          </IonCol>
          <IonCol size="6">
            <IonButton onClick={() => GameState.save()} expand="block">
              Save
            </IonButton>
          </IonCol>
          <IonCol size="6">
            <IonButton onClick={loadFile} expand="block">
              Load from File
            </IonButton>
          </IonCol>
          <IonCol size="6">
            <IonButton onClick={saveFile} expand="block">
              Save to File
            </IonButton>
          </IonCol>
          <IonCol size="6">
            <IonButton
              onClick={() => {
                settings.load(decode(textContents));
                GameState.save().then(reload);
              }}
              expand="block"
            >
              Import Text
            </IonButton>
          </IonCol>
          <IonCol size="6">
            <IonButton
              onClick={() => setTextContents(encode(settings.save(), debug))}
              expand="block"
            >
              Export Text
            </IonButton>
          </IonCol>
          <IonCol size="12">
            <IonTextarea
              label="Data for import/export"
              labelPlacement="floating"
              fill="outline"
              rows={5}
              autoGrow={true}
              value={textContents}
              onIonInput={(e) => setTextContents(e.detail.value ?? "")}
            ></IonTextarea>
          </IonCol>
        </IonRow>
      </IonCardContent>
    </IonCard>
  );
}

function NumberFormatPanel() {
  const settings = useGameState();

  return (
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>
          <IonRow>
            <IonCol size="12" className="ion-text-center">
              <IonText>Number Format</IonText>
            </IonCol>
          </IonRow>
        </IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <IonRow>
          <IonCol size="12">
            <IonText>Current number format is </IonText>
            <IonText color="primary">
              {Notation.get(settings.numberFormat).name}
            </IonText>
          </IonCol>
        </IonRow>
        <IonRow>
          {Object.values(Notation.all).map((notation) => (
            <IonCol size="6" key={notation.name}>
              <IonButton
                onClick={() => settings.set({ numberFormat: notation.name })}
                color={
                  settings.numberFormat === notation.name
                    ? "secondary"
                    : "primary"
                }
                expand="block"
              >
                <IonGrid>
                  <IonRow>
                    <IonCol size="12" className="ion-text-center">
                      <IonLabel>{notation.name}</IonLabel>
                    </IonCol>
                  </IonRow>
                  <IonRow>
                    {[
                      // "0.123456",
                      "123456.789",
                      // "12345678901234567890.1234567890",
                      // "123.456e78.9",
                    ].map((num, idx) => (
                      <IonCol
                        key={`sample-${notation.name}-${idx}`}
                        size="12"
                        className="ion-text-center"
                      >
                        <IonText>{notation.format(num, 3, 3, 3)}</IonText>
                      </IonCol>
                    ))}
                  </IonRow>
                </IonGrid>
              </IonButton>
            </IonCol>
          ))}
        </IonRow>
      </IonCardContent>
    </IonCard>
  );
}

function AdvancedPanel() {
  const settings = useGameState();
  const [tps, setTps] = useState(settings.ticksPerSec);
  const [fps, setFps] = useState(settings.rendersPerSec);
  const [sps, setSps] = useState(settings.saveFrequencySecs);

  useEffect(() => {
    setTps(settings.ticksPerSec);
  }, [settings.ticksPerSec]);

  useEffect(() => {
    setFps(settings.rendersPerSec);
  }, [settings.rendersPerSec]);

  useEffect(() => {
    setSps(settings.saveFrequencySecs);
  }, [settings.saveFrequencySecs]);

  return (
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>
          <IonRow>
            <IonCol size="12" className="ion-text-center">
              <IonText>Advanced Settings</IonText>
            </IonCol>
          </IonRow>
        </IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <IonRow>
          <IonCol size="12">
            If you are having performance issues, increase the time between
            updates. Faster updating frequncies lead to better experience but
            might use a lot of CPU.
          </IonCol>
          <IonCol size="6" className="ion-text-right">
            Updating frequency:
          </IonCol>
          <IonCol size="6" className="ion-text-center">
            {Math.floor(1000.0 / settings.ticksPerSec)}ms
          </IonCol>
          <IonCol size="6"></IonCol>
          <IonCol size="6">
            <IonRange
              min={6}
              max={100}
              step={1}
              pin={true}
              pinFormatter={(value) => `${Math.floor(1000.0 / value)}ms`}
              value={tps}
              onIonInput={(e) => setTps(e.detail.value as number)}
              onIonChange={(e) => {
                settings.set({ ticksPerSec: e.detail.value as number });
              }}
              className="ion-no-padding"
            ></IonRange>
          </IonCol>
          <IonCol size="6" className="ion-text-right">
            Rendering frequency:
          </IonCol>
          <IonCol size="6" className="ion-text-center">
            {Math.floor(1000.0 / settings.rendersPerSec)}ms
          </IonCol>
          <IonCol size="6"></IonCol>
          <IonCol size="6">
            <IonRange
              min={1}
              max={60}
              step={1}
              pin={true}
              pinFormatter={(value) => `${Math.floor(1000.0 / value)}ms`}
              value={fps}
              onIonInput={(e) => setFps(e.detail.value as number)}
              onIonChange={(e) => {
                settings.set({ rendersPerSec: e.detail.value as number });
              }}
              className="ion-no-padding"
            ></IonRange>
          </IonCol>
        </IonRow>
        <IonRow>
          <IonCol size="12">
            Change how often the session is saved in the background. More
            frequent saving leads to faster backups, but increases CPU and I/O
            usage
          </IonCol>
          <IonCol size="6" className="ion-text-right">
            Saving frequency:
          </IonCol>
          <IonCol size="6" className="ion-text-center">
            {format.time(1000 * settings.saveFrequencySecs, { ago: "" })}
          </IonCol>
          <IonCol size="6"></IonCol>
          <IonCol size="6">
            <IonRange
              min={1}
              max={60}
              step={1}
              pin={true}
              pinFormatter={(value) =>
                format
                  .time(1000 * (600 / value), {
                    ago: "",
                    len: "tiny",
                  })
                  .replace(":", "m:") + "s"
              }
              value={600 / sps}
              onIonInput={(e) => setSps(600 / (e.detail.value as number))}
              onIonChange={(e) => {
                settings.set({
                  saveFrequencySecs: 600 / (e.detail.value as number),
                });
              }}
              className="ion-no-padding"
            ></IonRange>
          </IonCol>
        </IonRow>
      </IonCardContent>
    </IonCard>
  );
}

function ResetPanel() {
  const [resetAcknowledged, setResetAcknowledged] = useState(false);

  function resetAll() {
    if (!resetAcknowledged) {
      return;
    }
    setResetAcknowledged(false);
    GameState.reset();
    database.clear().then(reload);
  }

  return (
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>
          <IonRow>
            <IonCol size="12" className="ion-text-center">
              <IonText>Reset</IonText>
            </IonCol>
          </IonRow>
        </IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <IonRow>
          <IonCol size="12">
            <IonText color="danger">
              WARNING: this will completely reset your settings and delete all
              saved progress. Only use this if you want to restart from the
              beginning, or if something in the settings is so messed up that it
              is unusable.
            </IonText>
          </IonCol>
          <IonCol size="12">
            <IonCheckbox
              justify="end"
              checked={resetAcknowledged}
              onIonChange={() => setResetAcknowledged((a) => !a)}
            >
              I understand what this means and still want to reset
            </IonCheckbox>
          </IonCol>
          <IonCol size="12" class="ion-text-right">
            <IonButton
              onClick={resetAll}
              disabled={!resetAcknowledged}
              color={resetAcknowledged ? "danger" : "medium"}
            >
              Reset everything
            </IonButton>
          </IonCol>
        </IonRow>
      </IonCardContent>
    </IonCard>
  );
}

function DebugPanel() {
  const settings = useGameState();
  if (!window.location.search.toLowerCase().includes("debug")) {
    return null;
  }

  return (
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>
          <IonRow>
            <IonCol size="12" className="ion-text-center">
              <IonText>Debug Context</IonText>
            </IonCol>
          </IonRow>
        </IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <IonRow>
          <IonCol size="12">
            <IonTextarea
              autoGrow={true}
              readonly={true}
              value={encode(settings, true)}
            ></IonTextarea>
          </IonCol>
        </IonRow>
      </IonCardContent>
    </IonCard>
  );
}

function saveFile() {
  const settings = GameState.singleton;
  const debug = window.location.search.toLowerCase().includes("debug");
  const name = (import.meta.env.NAME as string).replace(/\W/g, "_");
  const version = (import.meta.env.VERSION as string).replace(/\W/g, "_");
  const date = new Date()
    .toISOString()
    .replace(/\D/g, " ")
    .trim()
    .replace(/\D/g, "-");
  const fileName = `${name}-v${version}-${date}`;
  const fileData = encode(settings.save(), debug);
  const contents = new Blob([fileData], { type: "text/plain" });

  const url = URL.createObjectURL(contents);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function loadFile() {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.addEventListener(
    "change",
    function (changeEvent) {
      const files = (changeEvent.target as HTMLInputElement).files;
      if (!files || files.length === 0 || !files[0]) {
        return;
      }

      const reader = new FileReader();
      reader.onload = function (loadEvent) {
        const contents = loadEvent.target?.result;
        if (!contents || typeof contents !== "string") {
          return;
        }

        const settings = GameState.singleton;
        settings.load(decode(contents));
        settings.tick(undefined, "load");
        GameState.save().then(reload);
      };

      reader.readAsText(files[0]);
    },
    false,
  );

  fileInput.click();
}

function reload() {
  const history = createBrowserHistory();
  history.push("/");
  window.location.reload();
}

function isDebug() {
  return window.location.search.toLowerCase().includes("debug");
}
