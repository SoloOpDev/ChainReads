import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "./lib/wagmi";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <WagmiProvider config={wagmiConfig}>
    <App />
  </WagmiProvider>
);
