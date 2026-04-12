import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { PlanningCenterClient } from './client.js';
import { getServicesToolDefinitions, handleServicesTool } from './tools/services.js';
import { getPeopleToolDefinitions, handlePeopleTool } from './tools/people.js';
import { getGroupsToolDefinitions, handleGroupsTool } from './tools/groups.js';
import { getRegistrationsToolDefinitions, handleRegistrationsTool } from './tools/registrations.js';
import { getCheckInsToolDefinitions, handleCheckInsTool } from './tools/checkins.js';
import { PCO_CONTEXT_PROMPT, PCO_CONTEXT_CONTENT } from './prompts/pco-context.js';

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

const server = new Server(
  { name: 'planning-center-mcp', version: '1.0.0' },
  { capabilities: { tools: {}, prompts: {} } }
);

// Collect all tool definitions
const allTools = [
  ...getServicesToolDefinitions(),
  ...getPeopleToolDefinitions(),
  ...getGroupsToolDefinitions(),
  ...getRegistrationsToolDefinitions(),
  ...getCheckInsToolDefinitions(),
];

// Map tool names to their module handlers
const servicesTools = new Set(getServicesToolDefinitions().map((t) => t.name));
const peopleTools = new Set(getPeopleToolDefinitions().map((t) => t.name));
const groupsTools = new Set(getGroupsToolDefinitions().map((t) => t.name));
const registrationsTools = new Set(getRegistrationsToolDefinitions().map((t) => t.name));
const checkInsTools = new Set(getCheckInsToolDefinitions().map((t) => t.name));

// Register tools/list handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools,
}));

// Register tools/call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  let result: string;

  if (servicesTools.has(name)) {
    result = await handleServicesTool(name, args as Record<string, unknown>, client);
  } else if (peopleTools.has(name)) {
    result = await handlePeopleTool(name, args as Record<string, unknown>, client);
  } else if (groupsTools.has(name)) {
    result = await handleGroupsTool(name, args as Record<string, unknown>, client);
  } else if (registrationsTools.has(name)) {
    result = await handleRegistrationsTool(name, args as Record<string, unknown>, client);
  } else if (checkInsTools.has(name)) {
    result = await handleCheckInsTool(name, args as Record<string, unknown>, client);
  } else {
    result = JSON.stringify({
      success: false,
      data: null,
      error: `Unknown tool: ${name}`,
      metadata: {},
    });
  }

  return {
    content: [{ type: 'text', text: result }],
  };
});

// Register prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [PCO_CONTEXT_PROMPT],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === 'pco-context') {
    return {
      description: PCO_CONTEXT_PROMPT.description,
      messages: [
        {
          role: 'user' as const,
          content: { type: 'text' as const, text: PCO_CONTEXT_CONTENT },
        },
      ],
    };
  }
  throw new Error(`Unknown prompt: ${request.params.name}`);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Planning Center MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.close();
  process.exit(0);
});
