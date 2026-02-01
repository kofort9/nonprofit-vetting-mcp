import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from '../core/config.js';
import { ProPublicaClient } from '../domain/nonprofit/propublica-client.js';
import * as tools from '../domain/nonprofit/tools.js';
import { logError, logInfo } from '../core/logging.js';

// Server configuration
const SERVER_NAME = 'nonprofit-vetting-mcp';
const SERVER_VERSION = '1.0.0';

// Load configuration and initialize client
const config = loadConfig();
const propublicaClient = new ProPublicaClient(config.propublica);
const { thresholds } = config;

// Create MCP server instance
const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list_tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_nonprofit',
        description:
          'Search for nonprofits by name. Returns matching organizations with EIN, name, city, state, and NTEE code. Data from ProPublica Nonprofit Explorer.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (organization name or keywords)',
            },
            state: {
              type: 'string',
              description: 'Optional: Filter by state (2-letter code, e.g., "CA", "NY")',
            },
            city: {
              type: 'string',
              description: 'Optional: Filter by city name',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_nonprofit_profile',
        description:
          'Get detailed profile for a nonprofit by EIN. Returns organization info, 501(c)(3) status, years operating, and latest 990 financial summary including overhead ratio. Data from ProPublica Nonprofit Explorer.',
        inputSchema: {
          type: 'object',
          properties: {
            ein: {
              type: 'string',
              description:
                'Employer Identification Number (EIN). Accepts formats: "12-3456789" or "123456789"',
            },
          },
          required: ['ein'],
        },
      },
      {
        name: 'check_tier1',
        description:
          'Run Tier 1 automated vetting checks on a nonprofit. Evaluates: 501(c)(3) status, years operating, revenue range, overhead ratio, and recent 990 filing. Returns pass/fail for each check, overall score (0-100), recommendation (PASS/REVIEW/REJECT), and any red flags. Data from ProPublica Nonprofit Explorer.',
        inputSchema: {
          type: 'object',
          properties: {
            ein: {
              type: 'string',
              description:
                'Employer Identification Number (EIN). Accepts formats: "12-3456789" or "123456789"',
            },
          },
          required: ['ein'],
        },
      },
      {
        name: 'get_red_flags',
        description:
          'Get red flags and warnings for a nonprofit. Checks for: no 990 on file, stale data, high overhead, no ruling date, very low revenue, revenue decline, non-501(c)(3) status. Returns list of flags with severity (HIGH/MEDIUM/LOW) and details. Data from ProPublica Nonprofit Explorer.',
        inputSchema: {
          type: 'object',
          properties: {
            ein: {
              type: 'string',
              description:
                'Employer Identification Number (EIN). Accepts formats: "12-3456789" or "123456789"',
            },
          },
          required: ['ein'],
        },
      },
    ],
  };
});

// Format any ToolResponse into an MCP content response
function formatToolResponse(result: { success: boolean }) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    isError: !result.success,
  };
}


function argString(args: Record<string, unknown> | undefined, key: string): string {
  const val = args?.[key];
  return typeof val === 'string' ? val : '';
}

function argStringOpt(args: Record<string, unknown> | undefined, key: string): string | undefined {
  const val = args?.[key];
  return typeof val === 'string' ? val : undefined;
}

// Handle call_tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'search_nonprofit') {
      return formatToolResponse(await tools.searchNonprofit(propublicaClient, {
        query: argString(args, 'query'),
        state: argStringOpt(args, 'state'),
        city: argStringOpt(args, 'city'),
      }));
    }

    if (name === 'get_nonprofit_profile') {
      return formatToolResponse(await tools.getNonprofitProfile(propublicaClient, {
        ein: argString(args, 'ein'),
      }));
    }

    if (name === 'check_tier1') {
      return formatToolResponse(await tools.checkTier1(propublicaClient, {
        ein: argString(args, 'ein'),
      }, thresholds));
    }

    if (name === 'get_red_flags') {
      return formatToolResponse(await tools.getRedFlags(propublicaClient, {
        ein: argString(args, 'ein'),
      }, thresholds));
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start server
export async function startServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logInfo(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}

// Graceful shutdown
process.on('SIGINT', () => {
  logInfo('Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logInfo('Received SIGTERM, shutting down...');
  process.exit(0);
});
