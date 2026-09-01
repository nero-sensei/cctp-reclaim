import "./polyfill";
import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import App from "./App";
import { RPC_URL } from "./config";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./index.css";

function Missing() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center gap-3 px-6">
      <h1 className="t-base font-medium">RPC endpoint not configured</h1>
      <p className="muted t-sm leading-relaxed">
        Set <code>VITE_RPC_URL</code> in the build environment and redeploy. Solana&apos;s public
        endpoint will not work: it rejects getProgramAccounts from a browser origin.
      </p>
    </div>
  );
}

function Root() {
  const endpoint = useMemo(() => RPC_URL, []);

  if (!endpoint) return <Missing />;

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <ConnectionProvider endpoint={endpoint}>
          <WalletProvider wallets={[]} autoConnect>
            <WalletModalProvider>
              <App />
            </WalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </MotionConfig>
    </LazyMotion>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
