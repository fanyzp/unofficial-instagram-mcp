#!/usr/bin/env node
// Entry point for npx and direct runs.
//
//   unofficial-instagram-mcp            start the MCP server (stdio)
//   unofficial-instagram-mcp install    run the interactive installer
//
// Examples:
//   npx github:fanyzp/unofficial-instagram-mcp install
//   npx github:fanyzp/unofficial-instagram-mcp

if (process.argv[2] === 'install') {
  process.argv = [process.argv[0], 'unofficial-instagram-mcp-install', ...process.argv.slice(3)];
  await import('./install.mjs');
} else {
  await import('../src/server.js');
}
