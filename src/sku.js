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

function idle(timeout) {
  return new Promise(resolve => setTimeout(resolve, timeout));
}

/**
 * Get the stdout of a command on the SKU device via SSH.
 * @param {string} ip The IP address of the device.
 * @param {string} user The username to use for SSH.
 * @param {string[]} commands The commands to run.
 * @return {Promise<?string>} The stdout of the command.
**/
async function waitSSH(ip, user, commands) {
  const proc = Bun.spawn([
    'ssh',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'PasswordAuthentication=no',
    `${user}@${ip}`,
    ...commands,
  ], { stderr: 'ignore' });

  await idle(2000);
  if (!proc.killed) {
    if (DEBUG) {
      console.warn(`${ip}: ${waitSSH.name} took too long to exit, killing`);
    }
    proc.kill();
    return null;
  }

  const exited = await proc.exited;
  if (exited !== 0) {
    if (DEBUG) {
      console.warn(`${ip}: ${waitSSH.name} exited with code ${exited}`);
    }
    return null;
  }

  const text = await new Response(proc.stdout).text();
  return text.trim();
}

/**
 * Get the build stamp of the SKU device.
 * @param {string} ip The IP address of the device.
 * @param {string} user The username to use for SSH.
 * @return {Promise<?string>} The build stamp of the device.
**/
export async function buildStamp(ip, user = 'u') {
  const content = await waitSSH(ip, user, ['cat', '/etc/buildstamp']);
  if (!content)
  return null;

  for (const line of content.split('\n')) {
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
export async function biosVersion(ip, user = 'u') {
  return await waitSSH(ip, user, ['cat', '/sys/class/dmi/id/bios_version']);
}

/**
 * Get the kernel release of the SKU device.
 * @param {string} ip The IP address of the device.
 * @param {string} user The username to use for SSH.
 * @return {Promise<?string>} The kernel release of the device.
**/
export async function kernel(ip, user = 'u') {
  return await waitSSH(ip, user, ['uname', '-r']);
}

/**
 * Get the hostname of the SKU device.
 * @param {string} ip The IP address of the device.
 * @param {string} user The username to use for SSH.
 * @return {Promise<?string>} The hostname of the device.
**/
export async function hostname(ip, user = 'u') {
  return await waitSSH(ip, user, ['cat', '/etc/hostname']);
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
