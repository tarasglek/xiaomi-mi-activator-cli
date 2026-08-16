#!/usr/bin/env node

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  activationComplete,
  deviceMatches,
  disconnectActivator,
  maskSecret,
  parseArgs,
  runToExit,
  writeCredentials,
} from "./lib/cli.mjs";
import { loadActivator, waitFor } from "./lib/dom-runner.mjs";

const require = createRequire(import.meta.url);
const { Bluetooth } = require("webbluetooth");
const TERMINAL_FAILURE = /(?:Activation|Register|Login) Failed!|Something went wrong/i;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let selectedDevice;
  let dom;
  const disconnect = () => disconnectActivator(dom?.window, selectedDevice);
  const onSignal = (signal) => {
    disconnect();
    console.error(`Interrupted by ${signal}; Bluetooth disconnected.`);
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  const onSigint = () => onSignal("SIGINT");
  const onSigterm = () => onSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  process.once("exit", disconnect);

  const bluetooth = new Bluetooth({
    allowAllDevices: true,
    scanTime: Math.ceil(options.timeout / 1_000),
    deviceFound(device) {
      const matched = deviceMatches(device, options.mac);
      console.error(`Discovered ${device.name || "unnamed"} (${device.id})${matched ? " [target]" : ""}`);
      if (matched) selectedDevice = device;
      return matched;
    },
  });

  try {
    const htmlPath = fileURLToPath(new URL("../Temp_universal_mi_activate.html", import.meta.url));
    dom = await loadActivator(htmlPath, bluetooth, { console });
    const { window } = dom;
    window.handleError = (error) => {
      window.__cliError = error?.message ?? String(error);
      window.addLog(`CLI error: ${window.__cliError}`);
      window.resetVariables();
    };

    console.error(`Connecting to ${options.mac}…`);
    window.connect();
    await waitFor(
      () => ({
        connected: window.miConnected === true,
        error: window.__cliError,
        log: window.document.getElementById("log").textContent,
      }),
      {
        success: ({ connected }) => connected,
        failure: ({ error, log }) => Boolean(error) || TERMINAL_FAILURE.test(log),
        timeout: options.timeout,
      },
    );

    console.error("Running original Mi activation workflow…");
    window.sendRegister();
    const finalState = await waitFor(
      () => ({
        log: window.document.getElementById("log").textContent,
        token: window.document.getElementById("mi_token").value,
        bindKey: window.document.getElementById("mi_bind_key").value,
      }),
      {
        success: ({ log, token, bindKey }) => activationComplete(log, { token, bindKey }),
        failure: ({ log }) => TERMINAL_FAILURE.test(log),
        timeout: options.timeout,
      },
    );

    const credentials = { mac: options.mac, token: finalState.token, bindKey: finalState.bindKey };
    await writeCredentials(options.output, credentials);
    console.error(`Activation and login verified. Credentials written to ${options.output} (mode 0600).`);
    console.error(`Mi token: ${maskSecret(credentials.token)}; bind key: ${maskSecret(credentials.bindKey)}`);
  } finally {
    disconnect();
    dom?.window?.close();
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    process.removeListener("exit", disconnect);
  }
}

await runToExit(
  main,
  (code) => process.exit(code),
  (error) => console.error(error?.stack ?? error),
);
