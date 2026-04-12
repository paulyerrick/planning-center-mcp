import { z } from 'zod';
import { PlanningCenterClient } from '../client.js';
import { toolSuccess, toolError } from '../response.js';

/** Handle a Groups module tool call */
export async function handleGroupsTool(
  name: string,
  args: Record<string, unknown>,
  client: PlanningCenterClient
): Promise<string> {
  const start = Date.now();

  try {
    switch (name) {
      case 'get_group_types': {
        const { items, totalCount } = await client.paginate(
          '/groups/v2/group_types',
          { order: 'name' }
        );

        return JSON.stringify(toolSuccess(items, {
          count: items.length,
          totalCount,
          pcoEndpoint: '/groups/v2/group_types',
          executionMs: Date.now() - start,
        }));
      }

      case 'list_groups': {
        const schema = z.object({
          groupTypeId: z.string().optional(),
          campus: z.string().optional(),
          limit: z.number().optional().default(50),
        });
        const parsed = schema.parse(args);

        const params: Record<string, string | number> = {
          order: 'name',
          per_page: parsed.limit,
        };
        if (parsed.groupTypeId) {
          params['where[group_type_id]'] = parsed.groupTypeId;
        }

        const response = await client.get<any>('/groups/v2/groups', params);
        let groups = Array.isArray(response.data)
          ? response.data.map((r: any) => client.flatten(r))
          : [];

        if (parsed.campus) {
          const campusLower = parsed.campus.toLowerCase();
          groups = groups.filter((g: any) => {
            const loc = ((g.location as string) ?? '').toLowerCase();
            return loc.includes(campusLower);
          });
        }

        return JSON.stringify(toolSuccess(groups, {
          count: groups.length,
          totalCount: response.meta?.total_count,
          pcoEndpoint: '/groups/v2/groups',
          executionMs: Date.now() - start,
        }));
      }

      case 'get_group_members': {
        const schema = z.object({ groupId: z.string() });
        const parsed = schema.parse(args);

        const { items, included, totalCount } = await client.paginateWithIncludes(
          `/groups/v2/groups/${parsed.groupId}/memberships`,
          { include: 'person', per_page: 100 }
        );

        const members = items.map((m: any) => {
          const personData = m.person_id
            ? client.resolveIncludes<any>(m.person_id, 'Person', included)
            : null;
          return {
            ...m,
            person_name: personData?.name ?? null,
            person_email: personData?.email ?? null,
          };
        });

        return JSON.stringify(toolSuccess(members, {
          count: members.length,
          totalCount,
          pcoEndpoint: `/groups/v2/groups/${parsed.groupId}/memberships`,
          executionMs: Date.now() - start,
        }));
      }

      case 'get_groups_without_leader': {
        const { items: groups } = await client.paginate('/groups/v2/groups', {
          order: 'name',
          per_page: 100,
        });

        const leaderless: any[] = [];

        for (const group of groups) {
          const groupId = (group as any).id as string;
          try {
            const response = await client.get<any>(
              `/groups/v2/groups/${groupId}/memberships`,
              { 'where[role]': 'leader', per_page: 1 }
            );
            const leaders = Array.isArray(response.data) ? response.data : [];
            if (leaders.length === 0) {
              leaderless.push(group);
            }
          } catch {
            // Skip groups we can't access
          }
        }

        return JSON.stringify(toolSuccess(leaderless, {
          count: leaderless.length,
          pcoEndpoint: '/groups/v2/groups/*/memberships',
          executionMs: Date.now() - start,
        }));
      }

      case 'get_upcoming_group_events': {
        const schema = z.object({
          groupId: z.string().optional(),
          daysAhead: z.number().optional().default(30),
        });
        const parsed = schema.parse(args);

        const cutoff = new Date();
        cutoff.setUTCDate(cutoff.getUTCDate() + parsed.daysAhead);

        const endpoint = parsed.groupId
          ? `/groups/v2/groups/${parsed.groupId}/events`
          : '/groups/v2/events';

        const { items, totalCount } = await client.paginate(endpoint, {
          order: 'starts_at',
          filter: 'upcoming',
        });

        const filtered = items.filter((e: any) => {
          const startsAt = new Date(e.starts_at as string);
          return startsAt <= cutoff;
        });

        return JSON.stringify(toolSuccess(filtered, {
          count: filtered.length,
          totalCount,
          pcoEndpoint: endpoint,
          executionMs: Date.now() - start,
        }));
      }

      case 'get_group_enrollment_stats': {
        // Aggregate stats across all groups: total members, avg group size, enrollment strategies
        const { items: groups, totalCount } = await client.paginate(
          '/groups/v2/groups',
          { order: 'name', per_page: 100 }
        );

        let totalMembers = 0;
        let groupsWithZeroMembers = 0;
        const enrollmentStrategies: Record<string, number> = {};
        const sizeDistribution = { small: 0, medium: 0, large: 0 }; // <5, 5-15, >15

        for (const group of groups) {
          const g = group as any;
          const memberCount = (g.memberships_count as number) ?? 0;
          totalMembers += memberCount;

          if (memberCount === 0) groupsWithZeroMembers++;
          if (memberCount < 5) sizeDistribution.small++;
          else if (memberCount <= 15) sizeDistribution.medium++;
          else sizeDistribution.large++;

          const strategy = (g.enrollment_strategy as string) ?? 'unknown';
          enrollmentStrategies[strategy] = (enrollmentStrategies[strategy] ?? 0) + 1;
        }

        const avgGroupSize = groups.length > 0
          ? Math.round((totalMembers / groups.length) * 10) / 10
          : 0;

        // Largest and smallest groups
        const sortedBySize = [...groups].sort(
          (a: any, b: any) => (b.memberships_count ?? 0) - (a.memberships_count ?? 0)
        );
        const largest = sortedBySize.slice(0, 5).map((g: any) => ({
          id: g.id,
          name: g.name,
          memberships_count: g.memberships_count,
        }));
        const smallest = sortedBySize
          .filter((g: any) => (g.memberships_count ?? 0) > 0)
          .slice(-5)
          .map((g: any) => ({
            id: g.id,
            name: g.name,
            memberships_count: g.memberships_count,
          }));

        return JSON.stringify(toolSuccess(
          {
            totalGroups: totalCount,
            totalMembers,
            averageGroupSize: avgGroupSize,
            groupsWithZeroMembers,
            sizeDistribution,
            enrollmentStrategies,
            largestGroups: largest,
            smallestActiveGroups: smallest,
          },
          {
            count: groups.length,
            totalCount,
            pcoEndpoint: '/groups/v2/groups',
            executionMs: Date.now() - start,
          }
        ));
      }

      default:
        return JSON.stringify(toolError(`Unknown groups tool: ${name}`));
    }
  } catch (err) {
    return JSON.stringify(
      toolError(PlanningCenterClient.formatError(err, 'Groups'), {
        pcoEndpoint: name,
        executionMs: Date.now() - start,
      })
    );
  }
}

/** Return tool definitions for registration */
export function getGroupsToolDefinitions() {
  return [
    {
      name: 'get_group_types',
      description:
        'Get all group types in Planning Center Groups (e.g., "Small Groups," "Bible Studies"). Call this first when working with groups to find groupTypeId values.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
    {
      name: 'list_groups',
      description:
        'List active Planning Center groups with member counts. Optionally filter by group type or campus. Use get_group_types first for valid groupTypeId values.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          groupTypeId: { type: 'string', description: 'Filter by group type ID' },
          campus: { type: 'string', description: 'Filter by campus name (partial match)' },
          limit: { type: 'number', description: 'Max results (default 50)' },
        },
        required: [] as string[],
      },
    },
    {
      name: 'get_group_members',
      description:
        'Get all members of a specific group. Returns names, roles (leader/member), and join dates. Use list_groups to find a groupId.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          groupId: { type: 'string', description: 'The group ID' },
        },
        required: ['groupId'],
      },
    },
    {
      name: 'get_groups_without_leader',
      description:
        'Find active groups with no leader assigned. Groups without leaders may be orphaned or need attention. Returns groups with member counts.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
    {
      name: 'get_upcoming_group_events',
      description:
        'Get upcoming events for a specific group or all groups. Useful for planning, spotting conflicts, and reviewing engagement.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          groupId: { type: 'string', description: 'Group ID (omit for all groups)' },
          daysAhead: { type: 'number', description: 'Days ahead to look (default 30)' },
        },
        required: [] as string[],
      },
    },
    {
      name: 'get_group_enrollment_stats',
      description:
        'Aggregate analytics across all groups: total members, average group size, size distribution (small/medium/large), enrollment strategy breakdown, groups with zero members, and the largest/smallest groups. Use for "how is group participation" or "are our small groups healthy" questions.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
  ];
}
