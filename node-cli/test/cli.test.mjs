import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  activationComplete,
  disconnectActivator,
  disconnectDevices,
  deviceMatches,
  parseArgs,
  runToExit,
  writeCredentials,
} from "../lib/cli.mjs";

test("requires an explicit valid MAC", () => {
  assert.deepEqual(parseArgs(["--mac", "aa:bb:cc:dd:ee:ff"]), {
    mac: "AA:BB:CC:DD:EE:FF",
    output: "mi-activation.credentials.json",
    timeout: 60_000,
  });
  assert.throws(() => parseArgs([]), /--mac/);
  assert.throws(() => parseArgs(["--mac", "bad"]), /invalid MAC/i);
});

test("requires registration and login before accepting credentials", () => {
  const credentials = { token: "0".repeat(24), bindKey: "1".repeat(32) };
  assert.equal(activationComplete("Login successfull", credentials), false);
  assert.equal(activationComplete("Activation successfull Login successfull", credentials), true);
});

test("matches only the explicit target MAC", () => {
  assert.equal(deviceMatches({ id: "aa:bb:cc:dd:ee:ff", name: "unexpected" }, "AA:BB:CC:DD:EE:FF"), true);
  assert.equal(deviceMatches({ id: "AA:BB:CC:00:00:00", name: "LYWSD02MMC" }, "AA:BB:CC:DD:EE:FF"), false);
});

test("disconnects selected devices even when their connected flag is false", () => {
  let calls = 0;
  const device = { gatt: { connected: false, disconnect() { calls += 1; } } };
  disconnectDevices(device, device);
  assert.equal(calls, 1);
});

test("detaches the original DOM logger before disconnecting", () => {
  const order = [];
  const logger = () => {};
  const device = {
    removeEventListener(type, listener) { order.push(["remove", type, listener]); },
    gatt: { disconnect() { order.push(["disconnect"]); } },
  };
  disconnectActivator({ bluetoothDevice: device, onDisconnected: logger }, device);
  assert.deepEqual(order, [
    ["remove", "gattserverdisconnected", logger],
    ["disconnect"],
  ]);
});

test("terminates the process after native adapters are cleaned up", async () => {
  const exits = [];
  await runToExit(async () => {}, (code) => exits.push(code), () => {});
  assert.deepEqual(exits, [0]);

  const failures = [];
  await runToExit(
    async () => { throw new Error("boom"); },
    (code) => exits.push(code),
    (error) => failures.push(error.message),
  );
  assert.deepEqual(exits, [0, 1]);
  assert.deepEqual(failures, ["boom"]);
});

test("atomically replaces permissive output with an owner-only file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mi-activation-"));
  const output = join(directory, "credentials.json");
  await writeFile(output, "old\n");
  await chmod(output, 0o644);
  const oldInode = (await stat(output)).ino;
  await writeCredentials(output, {
    mac: "AA:BB:CC:DD:EE:FF",
    token: "00112233445566778899aabb",
    bindKey: "00112233445566778899aabbccddeeff",
  });
  const outputStat = await stat(output);
  assert.notEqual(outputStat.ino, oldInode);
  assert.equal(outputStat.mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(output, "utf8")), {
    mac: "AA:BB:CC:DD:EE:FF",
    token: "00112233445566778899aabb",
    bindKey: "00112233445566778899aabbccddeeff",
  });
});
