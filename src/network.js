/**
 * Utility functions for network operations.
 *
 * @typedef {Object} Device
 * @property {string} ip The IP address of the device.
 * @property {string} mac The MAC address of the device.
 * @property {?string} hostname The hostname of the device.
 * @property {?number} seen The timestamp when the device was last seen.
**/

'use strict';
import { hostname as fallbackHost } from './sku.js';
const DEBUG = !!Bun.env.DEBUG;

/**
 * Scan the network for devices in the local network.
 * spawn the arp-scan command and parse the output.
 * @return {Promise<Device[]>} The list of devices found.
**/
export async function arpScan() {
  const args = [
    'sudo', 'arp-scan',
    '-lx',
    '-F', '${ip}\t${mac}',
  ];
  if (Bun.env.IF) {
    if (DEBUG) {
      console.info(`Using interface ${Bun.env.IF}`);
    }
    args.push('-I', Bun.env.IF);
  }

  const proc = Bun.spawn(args);
  const text = await new Response(proc.stdout).text();
  const exited = await proc.exited;

  if (exited !== 0) {
    if (DEBUG) {
      console.warn(`${arpScan.name} exited with code ${exited}`);
    }
    return [];
  }

  const devices = [];
  for (const line of (text || '').split('\n')) {
    const [ip, mac] = line.split('\t');
    if (ip && mac) {
      devices.push({ip, mac});
    }
  }
  return devices;
}

/**
 * Resolve the hostname of a device.
 * @param {string} ip The IP address of the device.
 * @param {string} domain The domain name of the local network.
 * @return {Promise<?string>} The hostname of the device.
**/
export async function resolveHost(ip, domain='local') {
  let parts;
  const proc = Bun.spawn(['host', '-W1', ip]);
  const text = await new Response(proc.stdout).text();
  const exited = await proc.exited;

  if (exited !== 0) {
    if (DEBUG) {
      console.warn(`${ip}: ${resolveHost.name} exited with code ${exited}`);
    }
    return null;
  }

  parts = (text || '').split(' ');
  if (parts.length < 5) {
    return '';
  }
  const hostname = parts.at(-1);
  parts = hostname.split('.');
  if (parts.length < 2 || parts.at(-2) !== domain) {
    if (parts[0] === '_gateway') {
      return '';
    }
    if (DEBUG) {
      console.warn(`${ip}: ${resolveHost.name} is fallbacking`);
    }
    const fallback = await fallbackHost(ip);
    return fallback || '';
  }

  return parts.at(-3) || '';
}
