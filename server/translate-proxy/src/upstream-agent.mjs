// Node's built-in fetch closes idle upstream sockets after ~4 seconds, so in
// practice almost every model call paid a fresh TCP + TLS handshake to the
// provider. Game chat arrives in bursts separated by long gaps, which is the
// worst case for that default. Keep connections warm for minutes instead.
import { Agent, setGlobalDispatcher } from 'undici';

export const UPSTREAM_KEEP_ALIVE_TIMEOUT_MS = 90_000;
export const UPSTREAM_KEEP_ALIVE_MAX_TIMEOUT_MS = 600_000;

let installed = false;

export const installUpstreamAgent = ({ env = process.env } = {}) => {
  if (installed) {
    return false;
  }
  if (String(env.UPSTREAM_KEEP_ALIVE || 'true').trim().toLowerCase() === 'false') {
    return false;
  }
  setGlobalDispatcher(
    new Agent({
      keepAliveTimeout: UPSTREAM_KEEP_ALIVE_TIMEOUT_MS,
      keepAliveMaxTimeout: UPSTREAM_KEEP_ALIVE_MAX_TIMEOUT_MS,
      connections: 64,
      pipelining: 1,
    }),
  );
  installed = true;
  return true;
};
