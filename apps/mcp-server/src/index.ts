#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createGatekeeperMcpServer } from './server.js';

const server = createGatekeeperMcpServer();

process.once('SIGINT', () => {
  void server.close().finally(() => {
    process.exitCode = 0;
  });
});

try {
  await server.connect(new StdioServerTransport());
} catch {
  console.error('Gatekeeper MCP server could not start.');
  process.exitCode = 1;
}
