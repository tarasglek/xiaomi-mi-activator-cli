import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";

import { JSDOM, VirtualConsole } from "jsdom";

export async function loadActivator(htmlPath, bluetooth, { console: targetConsole } = {}) {
  const virtualConsole = new VirtualConsole();
  if (targetConsole) virtualConsole.forwardTo(targetConsole);

  const dom = await JSDOM.fromFile(htmlPath, {
    resources: "usable",
    runScripts: "dangerously",
    virtualConsole,
    beforeParse(window) {
      Object.defineProperty(window.navigator, "bluetooth", {
        configurable: true,
        value: bluetooth,
      });
      Object.defineProperty(window, "crypto", {
        configurable: true,
        value: webcrypto,
      });
      window.TextDecoder = TextDecoder;
      window.TextEncoder = TextEncoder;
    },
  });

  if (dom.window.document.readyState !== "complete") {
    await new Promise((resolve, reject) => {
      dom.window.addEventListener("load", resolve, { once: true });
      dom.window.addEventListener("error", (event) => reject(event.error ?? new Error(event.message)), { once: true });
    });
  }
  return dom;
}

export async function waitFor(read, {
  success,
  failure = () => false,
  timeout = 60_000,
  interval = 25,
} = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const current = read();
    if (failure(current)) throw new Error(String(current));
    if (success(current)) return current;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Timed out after ${timeout}ms`);
}
