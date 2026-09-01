import { useCallback, useEffect, useState } from "react";

export function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem("theme") !== "light");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const toggle = useCallback(() => {
    const style = document.createElement("style");
    style.append(document.createTextNode("*,*::before,*::after{transition:none !important}"));
    document.head.appendChild(style);

    document.documentElement.classList.toggle("dark", !dark);
    document.body.offsetHeight;
    setDark(!dark);

    requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
  }, [dark]);

  return { dark, toggle };
}

export function useHardwareWallet() {
  const [hardware, setHardware] = useState(() => localStorage.getItem("hardware") === "1");

  const toggle = useCallback((next: boolean) => {
    localStorage.setItem("hardware", next ? "1" : "0");
    setHardware(next);
  }, []);

  return { hardware, setHardware: toggle };
}
