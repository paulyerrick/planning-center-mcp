import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { PlanningCenterClient } from '../client.js';
import { toolSuccess, toolError } from '../response.js';

/** Register all Services module tools */
export function registerServicesTools(server: Server, client: PlanningCenterClient): void {
  const tools = [
    {
      name: 'get_service_types',
      description:
        'Get all service types configured in Planning Center Services (e.g., "Sunday Morning," "Wednesday Night," "Online Campus"). Call this first when working with services to get the serviceTypeId values needed by other tools.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
    {
      name: 'get_upcoming_services',
      description:
        'Get upcoming service plans within a date range for a specific service type. Returns plan dates, titles, series titles, and key counts. Use get_service_types first to find the serviceTypeId.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          serviceTypeId: { type: 'string', description: 'The service type ID (from get_service_types)' },
          daysAhead: { type: 'number', description: 'Number of days ahead to look (default 14)' },
        },
        required: ['serviceTypeId'],
      },
    },
    {
      name: 'get_plan_teams',
      description:
        'Get all volunteer teams and their scheduling status for a specific service plan. Shows each team\'s name, how many positions are needed, and how many are filled. Useful for identifying volunteer gaps before a service.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          planId: { type: 'string', description: 'The plan ID' },
        },
        required: ['planId'],
      },
    },
    {
      name: 'get_unfilled_positions',
      description:
        'Find volunteer positions in upcoming services that have no one scheduled (status U for Unscheduled or D for Declined). Returns service dates, team names, and position names so staff can identify gaps and recruit volunteers.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          serviceTypeId: { type: 'string', description: 'The service type ID' },
          daysAhead: { type: 'number', description: 'Number of days ahead to look (default 14)' },
        },
        required: ['serviceTypeId'],
      },
    },
    {
      name: 'get_service_attendance',
      description:
        'Get headcount attendance for a past service plan. Returns total headcount and breakdown by attendance type if available. Use planId from get_upcoming_services or search.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          planId: { type: 'string', description: 'The plan ID' },
        },
        required: ['planId'],
      },
    },
    {
      name: 'search_songs',
      description:
        'Search the Planning Center song library by title or author. Returns matching songs with CCLI number, copyright info, and when each was last scheduled. Useful for music planning and licensing audits.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query (title or author)' },
          limit: { type: 'number', description: 'Max results to return (default 20)' },
        },
        required: ['query'],
      },
    },
  ];

  // Return tool list
  server.setRequestHandler(
    { method: 'tools/list' } as any,
    async () => ({ tools })
  );
}

/** Handle a services tool call — called from the main dispatcher */
export async function handleServicesTool(
  name: string,
  args: Record<string, unknown>,
  client: PlanningCenterClient
): Promise<string> {
  const start = Date.now();

  try {
    switch (name) {
      case 'get_service_types': {
        const { items, totalCount } = await client.paginate(
          '/services/v2/service_types'
        );
        const result = toolSuccess(items, {
          count: items.length,
          totalCount,
          pcoEndpoint: '/services/v2/service_types',
          executionMs: Date.now() - start,
        });
        return JSON.stringify(result);
      }

      case 'get_upcoming_services': {
        const schema = z.object({
          serviceTypeId: z.string(),
          daysAhead: z.number().optional().default(14),
        });
        const parsed = schema.parse(args);
        const cutoff = new Date();
        cutoff.setUTCDate(cutoff.getUTCDate() + parsed.daysAhead);

        const endpoint = `/services/v2/service_types/${parsed.serviceTypeId}/plans`;
        const { items, totalCount } = await client.paginate(endpoint, {
          filter: 'future',
          order: 'sort_date',
        });

        const filtered = items.filter((p: any) => {
          const sortDate = new Date(p.sort_date as string);
          return sortDate <= cutoff;
        });

        const result = toolSuccess(filtered, {
          count: filtered.length,
          totalCount,
          pcoEndpoint: endpoint,
          executionMs: Date.now() - start,
        });
        return JSON.stringify(result);
      }

      case 'get_plan_teams': {
        const schema = z.object({ planId: z.string() });
        const parsed = schema.parse(args);

        const endpoint = `/services/v2/service_types/0/plans/${parsed.planId}/team_members`;
        // First get teams for the plan
        // PCO plan teams endpoint: we need to go through the plan's teams
        // Actually, team members are under the plan
        const teamsEndpoint = `/services/v2/service_types/0/plans/${parsed.planId}/team_members`;

        // Get plan's teams first via the neededPositions or team approach
        // Plans belong to service_types, so we need to find the plan differently
        // The safer approach: use the plan's team_members endpoint
        const response = await client.get<any>(
          `/services/v2/plans/${parsed.planId}/team_members`,
          { per_page: 100 }
        );

        const members = Array.isArray(response.data)
          ? response.data.map((r: any) => client.flatten(r))
          : [];

        // Group by team
        const teams: Record<string, { name: string; members: any[]; needed: number; scheduled: number }> = {};
        for (const m of members) {
          const teamName = (m.team_position_name as string) || 'Unassigned';
          if (!teams[teamName]) {
            teams[teamName] = { name: teamName, members: [], needed: 0, scheduled: 0 };
          }
          teams[teamName].members.push(m);
          if ((m.status as string) === 'C') {
            teams[teamName].scheduled++;
          }
        }

        const result = toolSuccess(
          { members, teamSummary: Object.values(teams) },
          {
            count: members.length,
            pcoEndpoint: `/services/v2/plans/${parsed.planId}/team_members`,
            executionMs: Date.now() - start,
          }
        );
        return JSON.stringify(result);
      }

      case 'get_unfilled_positions': {
        const schema = z.object({
          serviceTypeId: z.string(),
          daysAhead: z.number().optional().default(14),
        });
        const parsed = schema.parse(args);
        const cutoff = new Date();
        cutoff.setUTCDate(cutoff.getUTCDate() + parsed.daysAhead);

        // Get upcoming plans
        const { items: plans } = await client.paginate(
          `/services/v2/service_types/${parsed.serviceTypeId}/plans`,
          { filter: 'future', order: 'sort_date' }
        );

        const futurePlans = plans.filter((p: any) => new Date(p.sort_date as string) <= cutoff);
        const unfilled: Array<{
          planId: string;
          planDate: string;
          planTitle: string;
          teamPositionName: string;
          name: string;
          status: string;
        }> = [];

        for (const plan of futurePlans) {
          const planId = (plan as any).id as string;
          try {
            const response = await client.get<any>(
              `/services/v2/service_types/${parsed.serviceTypeId}/plans/${planId}/team_members`,
              { per_page: 100 }
            );
            const members = Array.isArray(response.data)
              ? response.data.map((r: any) => client.flatten(r))
              : [];

            for (const m of members) {
              const status = m.status as string;
              if (status === 'U' || status === 'D') {
                unfilled.push({
                  planId,
                  planDate: (plan as any).sort_date as string,
                  planTitle: ((plan as any).title as string) || (plan as any).dates as string,
                  teamPositionName: (m.team_position_name as string) || 'Unknown Position',
                  name: (m.name as string) || 'Unassigned',
                  status,
                });
              }
            }
          } catch {
            // Skip plans we can't access
          }
        }

        const result = toolSuccess(unfilled, {
          count: unfilled.length,
          pcoEndpoint: `/services/v2/service_types/${parsed.serviceTypeId}/plans/*/team_members`,
          executionMs: Date.now() - start,
        });
        return JSON.stringify(result);
      }

      case 'get_service_attendance': {
        const schema = z.object({ planId: z.string() });
        const parsed = schema.parse(args);

        const response = await client.get<any>(
          `/services/v2/plans/${parsed.planId}/plan_times`
        );

        const planTimes = Array.isArray(response.data)
          ? response.data.map((r: any) => client.flatten(r))
          : [];

        const result = toolSuccess(planTimes, {
          count: planTimes.length,
          pcoEndpoint: `/services/v2/plans/${parsed.planId}/plan_times`,
          executionMs: Date.now() - start,
        });
        return JSON.stringify(result);
      }

      case 'search_songs': {
        const schema = z.object({
          query: z.string(),
          limit: z.number().optional().default(20),
        });
        const parsed = schema.parse(args);

        const response = await client.get<any>('/services/v2/songs', {
          'where[title]': parsed.query,
          order: 'title',
          per_page: parsed.limit,
        });

        const songs = Array.isArray(response.data)
          ? response.data.map((r: any) => client.flatten(r))
          : [];

        const result = toolSuccess(songs, {
          count: songs.length,
          totalCount: response.meta?.total_count,
          pcoEndpoint: '/services/v2/songs',
          executionMs: Date.now() - start,
        });
        return JSON.stringify(result);
      }

      default:
        return JSON.stringify(toolError(`Unknown services tool: ${name}`));
    }
  } catch (err) {
    return JSON.stringify(
      toolError(PlanningCenterClient.formatError(err, 'Services'), {
        pcoEndpoint: name,
        executionMs: Date.now() - start,
      })
    );
  }
}

/** Return tool definitions for registration in index.ts */
export function getServicesToolDefinitions() {
  return [
    {
      name: 'get_service_types',
      description:
        'Get all service types configured in Planning Center Services (e.g., "Sunday Morning," "Wednesday Night," "Online Campus"). Call this first when working with services to get the serviceTypeId values needed by other tools.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
    {
      name: 'get_upcoming_services',
      description:
        'Get upcoming service plans within a date range for a specific service type. Returns plan dates, titles, series titles, and key counts. Use get_service_types first to find the serviceTypeId.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          serviceTypeId: { type: 'string', description: 'The service type ID (from get_service_types)' },
          daysAhead: { type: 'number', description: 'Number of days ahead to look (default 14)' },
        },
        required: ['serviceTypeId'],
      },
    },
    {
      name: 'get_plan_teams',
      description:
        "Get all volunteer teams and their scheduling status for a specific service plan. Shows each team's name and member statuses. Useful for identifying volunteer gaps.",
      inputSchema: {
        type: 'object' as const,
        properties: {
          planId: { type: 'string', description: 'The plan ID' },
        },
        required: ['planId'],
      },
    },
    {
      name: 'get_unfilled_positions',
      description:
        'Find volunteer positions in upcoming services that have no one scheduled (status U or D). Returns service dates, team names, and position names so staff can identify gaps.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          serviceTypeId: { type: 'string', description: 'The service type ID' },
          daysAhead: { type: 'number', description: 'Number of days ahead to look (default 14)' },
        },
        required: ['serviceTypeId'],
      },
    },
    {
      name: 'get_service_attendance',
      description:
        'Get headcount attendance for a past service plan. Returns plan time data with any available headcount information.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          planId: { type: 'string', description: 'The plan ID' },
        },
        required: ['planId'],
      },
    },
    {
      name: 'search_songs',
      description:
        'Search the Planning Center song library by title. Returns matching songs with CCLI number, copyright info, and when each was last scheduled.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query (song title)' },
          limit: { type: 'number', description: 'Max results to return (default 20)' },
        },
        required: ['query'],
      },
    },
  ];
}
