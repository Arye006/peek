#!/usr/bin/env node
'use strict';

/**
 * Claude Code PostToolUse hook.
 *
 * Fires after Write/Edit/MultiEdit. If the touched file is a markdown document
 * that looks like a plan, it hands the path to peek and exits immediately — the
 * preview window opens or refreshes out of band, so the hook never blocks the
 * tool call and never prints anything into the transcript.
 *
 * Behaviour is tunable in ~/.claude/peek/config.json, written on first run.
 */

const path = require('path');
const { spawn } = require('child_process');
const { isPlan, loadConfig } = require('../src/matcher');

const WATCHED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

// peek needs fetch() and node:test, both of which land in 18. An older Node is
// treated like a missing one: do nothing rather than fail on every write.
const NODE_OK = Number(process.versions.node.split('.')[0]) >= 18;

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
    setTimeout(() => resolve(data), 1500).unref();
  });
}

(async () => {
  if (!NODE_OK) return;

  const cfg = loadConfig();
  if (!cfg.enabled) return;

  let payload;
  try {
    payload = JSON.parse((await readStdin()) || '{}');
  } catch (_) {
    return;
  }

  if (!WATCHED_TOOLS.has(payload.tool_name)) return;

  const file = payload.tool_input && (payload.tool_input.file_path || payload.tool_input.path);
  if (!file || !isPlan(file, cfg)) return;

  const child = spawn(
    process.execPath,
    [path.join(__dirname, '..', 'src', 'cli.js'), 'open', path.resolve(file), '--quiet'],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
})();
