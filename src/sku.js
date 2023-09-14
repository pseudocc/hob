/**
 * Utility functions for SKU devices.
 *
 * @typedef {Object} SKU
 * @property {boolean} sku This is a SKU device.
 * @property {?string} buildStamp The build stamp of the SKU device.
 * @property {?string} biosVersion The BIOS version of the SKU device.
 * @property {?string} kernel The kernel release of the SKU device.
**/

'use strict';
const DEBUG = !!Bun.env.DEBUG;

const sshNC = [
  'ssh',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'UserKnownHostsFile=/dev/null',
  '-o', 'PasswordAuthentication=no',
];

/**
 * Get the build stamp of the SKU device.
 * @param {string} ip The IP address of the device.
 * @param {string} user The username to use for SSH.
 * @return {Promise<?string>} The build stamp of the device.
**/
"ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
export async function buildStamp(ip, user='u') {
  const proc = Bun.spawn([
    ...sshNC, `${user}@${ip}`,
    'cat', '/etc/buildstamp',
  ], { stderr: 'ignore' });
  const text = await new Response(proc.stdout).text();
  const exited = await proc.exited;

  if (exited !== 0) {
    if (DEBUG) {
      console.warn(`${ip}: ${buildStamp.name} exited with code ${exited}`);
    }
    return null;
  }

  for (const line of (text || '').split('\n')) {
    if (line.startsWith('#'))
      continue;
    return line;
  }

  return null;
}

/**
 * Get the BIOS version of the SKU device.
 * @param {string} ip The IP address of the device.
 * @param {string} user The username to use for SSH.
 * @return {Promise<?string>} The BIOS version of the device.
**/
export async function biosVersion(ip, user='u') {
  const proc = Bun.spawn([
    ...sshNC, `${user}@${ip}`,
    'cat', '/sys/class/dmi/id/bios_version',
  ], { stderr: 'ignore' });
  const text = await new Response(proc.stdout).text();
  const exited = await proc.exited;

  if (exited !== 0) {
    if (DEBUG) {
      console.warn(`${ip}: ${biosVersion.name} exited with code ${exited}`);
    }
    return null;
  }

  return text.trim();
}

/**
 * Get the kernel release of the SKU device.
 * @param {string} ip The IP address of the device.
 * @param {string} user The username to use for SSH.
 * @return {Promise<?string>} The kernel release of the device.
**/
export async function kernel(ip, user='u') {
  const proc = Bun.spawn([
    ...sshNC, `${user}@${ip}`,
    'uname', '-r',
  ], { stderr: 'ignore' });
  const text = await new Response(proc.stdout).text();
  const exited = await proc.exited;

  if (exited !== 0) {
    if (DEBUG) {
      console.warn(`${ip}: ${kernel.name} exited with code ${exited}`);
    }
    return null;
  }

  return text.trim();
}

function skuGetter() {
  return !!this.buildStamp;
}

function projectionGetter() {
  const projection = {
    ip: this.ip,
    mac: this.mac,
    buildStamp: this.buildStamp,
    biosVersion: this.biosVersion,
    kernel: this.kernel,
  }
  return Object.freeze(projection);
}

export function defineSKU(device) {
  return Object.defineProperties(device, {
    sku: {
      get: skuGetter,
      enumerable: true,
    },
    projection: {
      get: projectionGetter,
      enumerable: true,
    },
  });
}
