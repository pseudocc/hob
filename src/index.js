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
const MAX_TOLERANCE = 5;

async function deviceScan() {
  console.info(`${new Date().toISOString()} Scanning...`);
  const scanStart = Date.now();
  const devices = await network.arpScan();
  const macs = new Set();

  for (const mac of deviceTable.keys()) {
    const device = deviceTable.get(mac);
    if (Date.now() - (device.seen || 0) < 6e4)
      continue;
    console.info('Device gone:', mac);
    deviceTable.delete(mac);
  }

  const promises = [];
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

    const saved = deviceTable.get(device.mac);
    if (saved) {
      saved.seen = Date.now();

      if (saved.ip !== device.ip) {
        if (DEBUG) {
          console.info(`${device.mac} IP: ${saved.ip} -> ${device.ip}`);
        }
        saved.ip = device.ip;
      }

      if (saved.tolerance > MAX_TOLERANCE || saved.sku)
        continue;

      device.tolerance = saved.tolerance;
    }

    const subPromise = network.resolveHost(device.ip).then(async hostname => {
      device.hostname = hostname;
      device.seen = Date.now();

      if (hostname == null) {
        device.tolerance++;
        return;
      }

      if (hostname === '')
        return;

      const buildStamp = await sku.buildStamp(device.ip);
      if (buildStamp != null) {
        device.buildStamp = buildStamp;
        device.biosVersion = await sku.biosVersion(device.ip);
        device.kernel = await sku.kernel(device.ip);
        device.tolerance = 0;
      } else {
        device.tolerance++;
      }

      if (DEBUG) {
        console.info(device);
      }
    });

    deviceTable.set(device.mac, sku.defineSKU(device));
    promises.push(subPromise);
  }

  await Promise.all(promises);
  const nextScan = Math.max(0, 1e4 - (Date.now() - scanStart));
  setTimeout(deviceScan, nextScan);
  console.info(`${new Date().toISOString()} Scan done, next in ${nextScan}ms`);
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

app.get('/pm2-restart', (c) => {
  setTimeout(() => {
    process.exit(2);
  }, 5000);
  return c.text("Restart in 5 seconds");
});

export default {
  port: Number(Bun.env.PORT) || 2991,
  fetch: app.fetch,
};
