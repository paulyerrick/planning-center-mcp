#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { PlanningCenterClient } from './client.js';
import { createPlanningCenterMcpServer } from './mcp.js';

dotenv.config();

const PCO_APP_ID = process.env.PCO_APP_ID;
const PCO_SECRET = process.env.PCO_SECRET;

if (!PCO_APP_ID || !PCO_SECRET) {
  console.error(
    'Error: PCO_APP_ID and PCO_SECRET environment variables are required.\n' +
    'Set them in your .env file or pass them as environment variables.\n' +
    'Get a Personal Access Token at: https://api.planningcenteronline.com/oauth/applications'
  );
  process.exit(1);
}

const client = new PlanningCenterClient(PCO_APP_ID, PCO_SECRET);
const server = createPlanningCenterMcpServer(client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Planning Center MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.close();
  process.exit(0);
});
