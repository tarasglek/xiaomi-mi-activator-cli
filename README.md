# Xiaomi Mi Activator CLI

Minimal [upstream](https://github.com/atc1441/atc1441.github.io) fork that lets coding agents activate Mi BLE devices without a browser.

The Node wrapper runs the unchanged `Temp_universal_mi_activate.html` and `core.js` using jsdom and Web Bluetooth.

## Usage

Linux requires a working BLE adapter and permission to access it.

```sh
cd node-cli
npm install
node activate.mjs --mac AA:BB:CC:DD:EE:FF --output device.credentials.json --timeout 90
```

Activation replaces the device's existing Mi binding. The CLI selects only the requested MAC, verifies activation and login, saves credentials with mode `0600`, and disconnects on exit. Use the generated `bindKey` with Home Assistant's Xiaomi BLE integration.
