'use strict';

const os = require('os');
const path = require('path');

// State lives outside the plugin directory so it survives plugin updates, which
// replace the checkout wholesale. PEEK_STATE_DIR redirects it, which is how the
// tests avoid touching a real installation.
const STATE_DIR = process.env.PEEK_STATE_DIR || path.join(os.homedir(), '.claude', 'peek');

module.exports = {
  STATE_DIR,
  statePath: path.join(STATE_DIR, 'state.json'),
  browserStatePath: path.join(STATE_DIR, 'browser.json'),
  browserProfile: path.join(STATE_DIR, 'browser-profile'),
  logPath: path.join(STATE_DIR, 'server.log'),
  userConfigPath: path.join(STATE_DIR, 'config.json'),
  DEFAULT_PORT: 7654,
  MAX_DOCS: 12,
};
