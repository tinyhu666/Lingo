import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const children = [];
let shuttingDown = false;

function prefixAndWrite(stream, prefix, target) {
  let buffer = '';

  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line) {
        continue;
      }
      target.write(`[${prefix}] ${line}\n`);
    }
  });

  stream.on('end', () => {
    const line = buffer.trim();
    if (line) {
      target.write(`[${prefix}] ${line}\n`);
    }
  });
}

function stopChildren(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }
    process.exit(exitCode);
  }, 300).unref();
}

function startProcess(name, args) {
  const child = spawn(npmCommand, args, {
    cwd: rootDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  prefixAndWrite(child.stdout, name, process.stdout);
  prefixAndWrite(child.stderr, name, process.stderr);

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    process.stderr.write(`[${name}] exited with ${reason}\n`);
    stopChildren(code ?? 1);
  });

  children.push(child);
  return child;
}

process.on('SIGINT', () => stopChildren(0));
process.on('SIGTERM', () => stopChildren(0));

startProcess('proxy', ['run', 'proxy:dev']);
startProcess('vite', ['run', 'dev']);
