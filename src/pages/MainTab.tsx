import { IonGrid } from "@ionic/react";

import TabApp from "../components/TabApp";

MainTab.init = () => {
  TabApp.register({
    path: "main",
    content: <MainTab />,
    icon: "diamondOutline",
    label: "$$$",
    title: "Russia Fines Google",
    from: "/",
  });
};

export default function MainTab() {
  return <IonGrid></IonGrid>;
}
