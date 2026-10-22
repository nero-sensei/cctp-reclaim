import "./polyfill";
import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { ConnectionProvider, WalletModalProvider, WalletProvider } from "@solana/wallet-adapter";
import App from "./App";
import { RPC_URL } from "./config";
import "@solana/wallet-adapter/styles.css";
import "./index.css";

const CONNECTION_CONFIG = { commitment: "finalized" } as const;

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
        <ConnectionProvider endpoint={endpoint} config={CONNECTION_CONFIG}>
          <WalletProvider chain="solana:mainnet">
            <WalletModalProvider>
              <App />
            </WalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </MotionConfig>
    </LazyMotion>
  );
}

if (/android/i.test(navigator.userAgent)) {
  import("@solana-mobile/wallet-standard-mobile").then(
    ({
      registerMwa,
      createDefaultAuthorizationCache,
      createDefaultChainSelector,
      createDefaultWalletNotFoundHandler,
    }) =>
      registerMwa({
        appIdentity: { name: "Reclaim", uri: window.location.origin, icon: "favicon.png" },
        authorizationCache: createDefaultAuthorizationCache(),
        chains: ["solana:mainnet"],
        chainSelector: createDefaultChainSelector(),
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      })
  ).catch(console.error);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
