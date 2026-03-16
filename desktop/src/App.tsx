import { useConnectionStore } from "./store/connection";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { MainLayout } from "./components/MainLayout";

export default function App() {
  const status = useConnectionStore((s) => s.status);

  if (status === "disconnected" || status === "connecting") {
    return <ConnectionDialog />;
  }

  // connected, reconnecting, or offline — show main layout with status bar
  return <MainLayout />;
}
