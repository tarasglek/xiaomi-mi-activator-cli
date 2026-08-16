import assert from "node:assert/strict";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadActivator, waitFor } from "../lib/dom-runner.mjs";

test("runs existing browser source with injected Bluetooth and Web Crypto", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mi-activation-dom-"));
  const html = join(directory, "fixture.html");
  await writeFile(html, `<!doctype html>
    <input id="mi_token"><input id="mi_bind_key"><div id="log"></div>
    <script>
      window.probe = () => ({ bluetooth: navigator.bluetooth, crypto: crypto.subtle });
    </script>`);
  const bluetooth = { requestDevice() {} };
  const dom = await loadActivator(html, bluetooth);
  assert.equal(dom.window.probe().bluetooth, bluetooth);
  assert.ok(dom.window.probe().crypto);
  dom.window.close();
});

test("waitFor resolves on success and rejects terminal failure", async () => {
  let value = "waiting";
  setTimeout(() => { value = "ready"; }, 10);
  await waitFor(() => value, { success: (current) => current === "ready", timeout: 100 });
  await assert.rejects(
    waitFor(() => "Activation Failed!", {
      success: () => false,
      failure: (current) => current.includes("Failed"),
      timeout: 100,
    }),
    /Activation Failed/,
  );
});
