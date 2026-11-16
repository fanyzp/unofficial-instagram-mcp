#!/usr/bin/env node
// Entry point for npx and direct runs.
//
//   unofficial-instagram-mcp            start the MCP server (stdio)
//   unofficial-instagram-mcp install    run the interactive installer
//   unofficial-instagram-mcp update     refresh the install (installer --force)
//
// Examples:
//   npx github:fanyzp/unofficial-instagram-mcp install
//   npx github:fanyzp/unofficial-instagram-mcp update
//   npx github:fanyzp/unofficial-instagram-mcp

const cmd = process.argv[2];
if (cmd === 'install' || cmd === 'update') {
  const extra = cmd === 'update' ? ['--force'] : [];
  process.argv = [process.argv[0], 'unofficial-instagram-mcp-install', ...extra, ...process.argv.slice(3)];
  await import('./install.mjs');
} else {
  await import('../src/server.js');
}
