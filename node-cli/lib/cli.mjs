import { open, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

export function normalizeMac(value) {
  const compact = String(value ?? "").replaceAll("-", ":").toUpperCase();
  if (!/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(compact)) {
    throw new Error(`Invalid MAC address: ${value ?? ""}`);
  }
  return compact;
}

export function parseArgs(argv) {
  const result = {
    mac: undefined,
    output: "mi-activation.credentials.json",
    timeout: 60_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if (option === "--mac") result.mac = value;
    else if (option === "--output") result.output = value;
    else if (option === "--timeout") result.timeout = Number(value) * 1_000;
    else throw new Error(`Unknown option: ${option}`);
    index += 1;
  }
  if (!result.mac) throw new Error("--mac is required");
  result.mac = normalizeMac(result.mac);
  if (!result.output) throw new Error("--output must not be empty");
  if (!Number.isFinite(result.timeout) || result.timeout <= 0) {
    throw new Error("--timeout must be a positive number of seconds");
  }
  return result;
}

export function deviceMatches(device, targetMac) {
  try {
    return normalizeMac(device.id) === targetMac;
  } catch {
    return false;
  }
}

export function activationComplete(log, { token, bindKey }) {
  return log.includes("Activation successfull")
    && log.includes("Login successfull")
    && token.length === 24
    && bindKey.length === 32;
}

export function disconnectDevices(...devices) {
  for (const device of new Set(devices.filter(Boolean))) {
    try {
      device.gatt?.disconnect();
    } catch {
      // Best-effort cleanup must continue for every tracked device.
    }
  }
}

export function disconnectActivator(window, selectedDevice) {
  const sourceDevice = window?.bluetoothDevice;
  if (sourceDevice && window?.onDisconnected) {
    sourceDevice.removeEventListener("gattserverdisconnected", window.onDisconnected);
  }
  disconnectDevices(selectedDevice, sourceDevice);
}

export async function writeCredentials(path, credentials) {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(credentials, null, 2)}\n`);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
  } finally {
    await handle?.close();
    await rm(temporary, { force: true });
  }
}

export async function runToExit(task, exit, report) {
  try {
    await task();
    exit(0);
  } catch (error) {
    report(error);
    exit(1);
  }
}

export function maskSecret(value) {
  return value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : "…";
}
