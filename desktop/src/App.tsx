import { useConnectionStore } from "./store/connection";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { MainLayout } from "./components/MainLayout";

export default function App() {
  const connected = useConnectionStore((s) => s.connected);
  return connected ? <MainLayout /> : <ConnectionDialog />;
}
