'use strict';

import { Hono } from 'hono';
import * as network from './network.js';
import * as sku from './sku.js';

const DEBUG = !!Bun.env.DEBUG;
if (DEBUG) {
  console.info('DEBUG mode is on');
}

const ignore = new Set();
if (Bun.env.IGNORE) {
  for (const mac of Bun.env.IGNORE.split(',')) {
    ignore.add(mac);
  }
}

/** @type {Map<string, network.Device & sku.SKU>} **/
const deviceTable = new Map();

async function deviceScan() {
  const devices = await network.arpScan();
  const macs = new Set();

  for (const mac of deviceTable.keys()) {
    const device = deviceTable.get(mac);
    if (Date.now() - (device.seen || 0) < 6e4)
      continue;
    deviceTable.delete(mac);
  }

  for (const device of devices) {
    if (macs.has(device.mac))
      continue;
    if (ignore.has(device.mac)) {
      if (DEBUG) {
        console.info('Ignore:', device.mac);
      }
      continue;
    }

    macs.add(device.mac);

    if (deviceTable.has(device.mac))
      continue;

    network.resolveHost(device.ip).then(async hostname => {
      if (hostname == null)
        return;

      device.hostname = hostname;
      device.seen = Date.now();

      if (hostname === '')
        return;

      const buildStamp = await sku.buildStamp(device.ip);
      if (buildStamp != null) {
        device.buildStamp = buildStamp;
        device.biosVersion = await sku.biosVersion(device.ip);
        device.kernel = await sku.kernel(device.ip);
      }

      if (DEBUG) {
        console.info(device);
      }
    });

    deviceTable.set(device.mac, sku.defineSKU(device));
  }

  setTimeout(deviceScan, 5e3);
}

deviceScan();
const app = new Hono();

app.get('/devices', (c) => {
  const accept = c.req.header('accept');
  if (DEBUG) {
    console.info('Accept:', accept);
  }
  const json = accept.includes('application/json');
  const result = json ? {} : [];
  for (const device of deviceTable.values()) {
    if (device.sku) {
      if (json) {
      result[device.hostname] = device.projection;
      } else {
        result.push(device.hostname);
      }
    }
  }

  return json ? c.json(result) : c.text(result.join(','));
});

export default {
  port: Number(Bun.env.PORT) || 2991,
  fetch: app.fetch,
};
