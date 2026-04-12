import { z } from 'zod';
import { PlanningCenterClient } from '../client.js';
import { toolSuccess, toolError } from '../response.js';

/** Handle a People module tool call */
export async function handlePeopleTool(
  name: string,
  args: Record<string, unknown>,
  client: PlanningCenterClient
): Promise<string> {
  const start = Date.now();

  try {
    switch (name) {
      case 'search_people': {
        const schema = z.object({
          query: z.string(),
          limit: z.number().optional().default(20),
        });
        const parsed = schema.parse(args);

        const response = await client.get<any>('/people/v2/people', {
          'where[search_name]': parsed.query,
          per_page: parsed.limit,
          include: 'emails,phone_numbers',
        });

        const people = Array.isArray(response.data)
          ? response.data.map((r: any) => {
              const flat = client.flatten(r);
              // Resolve included emails and phone numbers
              const personEmails = (r.relationships?.emails?.data ?? []).map((ref: any) =>
                client.resolveIncludes(ref.id, 'Email', response.included ?? [])
              ).filter(Boolean);
              const personPhones = (r.relationships?.phone_numbers?.data ?? []).map((ref: any) =>
                client.resolveIncludes(ref.id, 'PhoneNumber', response.included ?? [])
              ).filter(Boolean);
              return { ...flat, email_addresses: personEmails, phone_numbers: personPhones };
            })
          : [];

        return JSON.stringify(toolSuccess(people, {
          count: people.length,
          totalCount: response.meta?.total_count,
          pcoEndpoint: '/people/v2/people',
          executionMs: Date.now() - start,
        }));
      }

      case 'get_person': {
        const schema = z.object({ personId: z.string() });
        const parsed = schema.parse(args);

        const response = await client.get<any>(
          `/people/v2/people/${parsed.personId}`,
          { include: 'emails,phone_numbers,addresses,households' }
        );

        const person = client.flatten(response.data);
        const included = response.included ?? [];

        const emails = (response.data.relationships?.emails?.data ?? [])
          .map((ref: any) => client.resolveIncludes(ref.id, 'Email', included))
          .filter(Boolean);
        const phones = (response.data.relationships?.phone_numbers?.data ?? [])
          .map((ref: any) => client.resolveIncludes(ref.id, 'PhoneNumber', included))
          .filter(Boolean);
        const addresses = (response.data.relationships?.addresses?.data ?? [])
          .map((ref: any) => client.resolveIncludes(ref.id, 'Address', included))
          .filter(Boolean);
        const households = (response.data.relationships?.households?.data ?? [])
          .map((ref: any) => client.resolveIncludes(ref.id, 'Household', included))
          .filter(Boolean);

        return JSON.stringify(toolSuccess(
          { ...person, email_addresses: emails, phone_numbers: phones, addresses, households },
          {
            pcoEndpoint: `/people/v2/people/${parsed.personId}`,
            executionMs: Date.now() - start,
          }
        ));
      }

      case 'list_saved_lists': {
        const { items, totalCount } = await client.paginate(
          '/people/v2/lists',
          { order: 'name' }
        );

        return JSON.stringify(toolSuccess(items, {
          count: items.length,
          totalCount,
          pcoEndpoint: '/people/v2/lists',
          executionMs: Date.now() - start,
        }));
      }

      case 'get_people_by_list': {
        const schema = z.object({ listId: z.string() });
        const parsed = schema.parse(args);

        const { items, totalCount } = await client.paginate(
          `/people/v2/lists/${parsed.listId}/people`,
          { per_page: 100 }
        );

        return JSON.stringify(toolSuccess(items, {
          count: items.length,
          totalCount,
          hasMore: items.length < totalCount,
          pcoEndpoint: `/people/v2/lists/${parsed.listId}/people`,
          executionMs: Date.now() - start,
        }));
      }

      case 'get_people_stats': {
        // Use per_page=1 requests to get total_count from meta without fetching all records
        const totalResponse = await client.get<any>('/people/v2/people', { per_page: 1 });
        const totalCount = totalResponse.meta?.total_count ?? 0;

        // Get counts by status
        const statuses = ['active', 'inactive'];
        const statusCounts: Record<string, number> = {};
        for (const status of statuses) {
          try {
            const resp = await client.get<any>('/people/v2/people', {
              per_page: 1,
              'where[status]': status,
            });
            statusCounts[status] = resp.meta?.total_count ?? 0;
          } catch {
            statusCounts[status] = -1; // couldn't query
          }
        }

        // Get counts by membership
        const memberships = ['Member', 'Regular Attender', 'Visitor', 'No Membership'];
        const membershipCounts: Record<string, number> = {};
        for (const membership of memberships) {
          try {
            const resp = await client.get<any>('/people/v2/people', {
              per_page: 1,
              'where[membership]': membership,
            });
            membershipCounts[membership] = resp.meta?.total_count ?? 0;
          } catch {
            // Some orgs may not use this field
          }
        }

        // Recently added (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
        const recentResponse = await client.get<any>('/people/v2/people', {
          per_page: 1,
          'where[created_at][gte]': thirtyDaysAgo.toISOString(),
        });
        const recentlyAdded = recentResponse.meta?.total_count ?? 0;

        return JSON.stringify(toolSuccess(
          {
            totalPeople: totalCount,
            byStatus: statusCounts,
            byMembership: membershipCounts,
            addedLast30Days: recentlyAdded,
          },
          {
            pcoEndpoint: '/people/v2/people',
            executionMs: Date.now() - start,
          }
        ));
      }

      case 'get_people_by_status': {
        const schema = z.object({
          status: z.enum(['active', 'inactive']),
          limit: z.number().optional().default(50),
        });
        const parsed = schema.parse(args);

        const response = await client.get<any>('/people/v2/people', {
          'where[status]': parsed.status,
          per_page: parsed.limit,
          order: '-updated_at',
          include: 'emails',
        });

        const people = Array.isArray(response.data)
          ? response.data.map((r: any) => {
              const flat = client.flatten(r);
              const personEmails = (r.relationships?.emails?.data ?? []).map((ref: any) =>
                client.resolveIncludes(ref.id, 'Email', response.included ?? [])
              ).filter(Boolean);
              return { ...flat, email_addresses: personEmails };
            })
          : [];

        return JSON.stringify(toolSuccess(people, {
          count: people.length,
          totalCount: response.meta?.total_count,
          hasMore: people.length < (response.meta?.total_count ?? 0),
          pcoEndpoint: '/people/v2/people',
          executionMs: Date.now() - start,
        }));
      }

      case 'get_people_by_membership': {
        const schema = z.object({
          membership: z.string(),
          limit: z.number().optional().default(50),
        });
        const parsed = schema.parse(args);

        const response = await client.get<any>('/people/v2/people', {
          'where[membership]': parsed.membership,
          per_page: parsed.limit,
          order: 'last_name',
          include: 'emails',
        });

        const people = Array.isArray(response.data)
          ? response.data.map((r: any) => {
              const flat = client.flatten(r);
              const personEmails = (r.relationships?.emails?.data ?? []).map((ref: any) =>
                client.resolveIncludes(ref.id, 'Email', response.included ?? [])
              ).filter(Boolean);
              return { ...flat, email_addresses: personEmails };
            })
          : [];

        return JSON.stringify(toolSuccess(people, {
          count: people.length,
          totalCount: response.meta?.total_count,
          hasMore: people.length < (response.meta?.total_count ?? 0),
          pcoEndpoint: '/people/v2/people',
          executionMs: Date.now() - start,
        }));
      }

      case 'get_new_people': {
        const schema = z.object({
          days: z.number().optional().default(30),
          limit: z.number().optional().default(100),
        });
        const parsed = schema.parse(args);

        const since = new Date();
        since.setUTCDate(since.getUTCDate() - parsed.days);
        const sinceISO = since.toISOString();

        const response = await client.get<any>('/people/v2/people', {
          order: '-created_at',
          'where[created_at][gte]': sinceISO,
          per_page: parsed.limit,
          include: 'emails',
        });

        const people = Array.isArray(response.data)
          ? response.data.map((r: any) => {
              const flat = client.flatten(r);
              const personEmails = (r.relationships?.emails?.data ?? []).map((ref: any) =>
                client.resolveIncludes(ref.id, 'Email', response.included ?? [])
              ).filter(Boolean);
              return { ...flat, email_addresses: personEmails };
            })
          : [];

        return JSON.stringify(toolSuccess(people, {
          count: people.length,
          totalCount: response.meta?.total_count,
          pcoEndpoint: '/people/v2/people',
          executionMs: Date.now() - start,
        }));
      }

      case 'identify_at_risk_members': {
        const schema = z.object({
          inactiveWeeks: z.number().optional().default(6),
          limit: z.number().optional().default(100),
        });
        const parsed = schema.parse(args);

        // Find people who haven't checked in recently
        // Strategy: get check-ins from the last N weeks, build a set of active person IDs,
        // then compare against people with status=active who are NOT in that set
        const cutoffDate = new Date();
        cutoffDate.setUTCDate(cutoffDate.getUTCDate() - parsed.inactiveWeeks * 7);

        // Get recent check-ins to find who IS active
        const { items: recentCheckins } = await client.paginateWithIncludes(
          '/check-ins/v2/check_ins',
          {
            'where[checked_in_at][gte]': cutoffDate.toISOString(),
            per_page: 100,
          },
          20
        );

        const recentlyActiveIds = new Set<string>();
        for (const checkin of recentCheckins) {
          const personId = (checkin as any).person_id as string;
          if (personId) recentlyActiveIds.add(personId);
        }

        // Get active people who were created before the cutoff (not brand new)
        const createdBefore = new Date();
        createdBefore.setUTCDate(createdBefore.getUTCDate() - parsed.inactiveWeeks * 7 * 2);

        const { items: activePeople, totalCount } = await client.paginate(
          '/people/v2/people',
          {
            'where[status]': 'active',
            'where[created_at][lte]': createdBefore.toISOString(),
            per_page: 100,
            order: 'last_name',
          },
          Math.ceil(parsed.limit / 100) + 1
        );

        // Filter to those NOT in recent check-ins
        const atRisk = activePeople
          .filter((p: any) => !recentlyActiveIds.has(p.id as string))
          .slice(0, parsed.limit)
          .map((p: any) => ({
            id: p.id,
            name: p.name,
            first_name: p.first_name,
            last_name: p.last_name,
            status: p.status,
            membership: p.membership,
            created_at: p.created_at,
            updated_at: p.updated_at,
          }));

        return JSON.stringify(toolSuccess(
          {
            criteria: `Active people with no check-in in the last ${parsed.inactiveWeeks} weeks`,
            atRiskCount: atRisk.length,
            recentlyActivePeopleCount: recentlyActiveIds.size,
            totalActivePeople: totalCount,
            atRiskMembers: atRisk,
          },
          {
            count: atRisk.length,
            pcoEndpoint: '/check-ins/v2/check_ins + /people/v2/people',
            executionMs: Date.now() - start,
          }
        ));
      }

      case 'get_engagement_summary': {
        // Cross-module summary: people counts, group participation, recent check-in activity
        const results: Record<string, any> = {};

        // Total people by status
        const totalResp = await client.get<any>('/people/v2/people', { per_page: 1 });
        results.totalPeople = totalResp.meta?.total_count ?? 0;

        try {
          const activeResp = await client.get<any>('/people/v2/people', {
            per_page: 1,
            'where[status]': 'active',
          });
          results.activePeople = activeResp.meta?.total_count ?? 0;
          results.inactivePeople = results.totalPeople - results.activePeople;
        } catch {
          results.activePeople = 'unknown';
        }

        // Groups
        try {
          const groupsResp = await client.get<any>('/groups/v2/groups', { per_page: 1 });
          results.totalGroups = groupsResp.meta?.total_count ?? 0;
        } catch {
          results.totalGroups = 'module not accessible';
        }

        // Recent check-ins (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
        try {
          const checkinResp = await client.get<any>('/check-ins/v2/check_ins', {
            per_page: 1,
            'where[checked_in_at][gte]': sevenDaysAgo.toISOString(),
          });
          results.checkInsLast7Days = checkinResp.meta?.total_count ?? 0;
        } catch {
          results.checkInsLast7Days = 'module not accessible';
        }

        // First-time visitors last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
        try {
          const firstTimeResp = await client.get<any>('/check-ins/v2/check_ins', {
            per_page: 1,
            'where[kind]': 'first_time',
            'where[checked_in_at][gte]': thirtyDaysAgo.toISOString(),
          });
          results.firstTimeVisitorsLast30Days = firstTimeResp.meta?.total_count ?? 0;
        } catch {
          results.firstTimeVisitorsLast30Days = 'module not accessible';
        }

        // New people added last 30 days
        try {
          const newPeopleResp = await client.get<any>('/people/v2/people', {
            per_page: 1,
            'where[created_at][gte]': thirtyDaysAgo.toISOString(),
          });
          results.newPeopleLast30Days = newPeopleResp.meta?.total_count ?? 0;
        } catch {
          results.newPeopleLast30Days = 'unknown';
        }

        // Upcoming registration events
        try {
          const regResp = await client.get<any>('/registrations/v2/events', {
            per_page: 1,
            filter: 'upcoming',
          });
          results.upcomingRegistrationEvents = regResp.meta?.total_count ?? 0;
        } catch {
          results.upcomingRegistrationEvents = 'module not accessible';
        }

        return JSON.stringify(toolSuccess(results, {
          pcoEndpoint: 'multiple endpoints',
          executionMs: Date.now() - start,
        }));
      }

      default:
        return JSON.stringify(toolError(`Unknown people tool: ${name}`));
    }
  } catch (err) {
    return JSON.stringify(
      toolError(PlanningCenterClient.formatError(err, 'People'), {
        pcoEndpoint: name,
        executionMs: Date.now() - start,
      })
    );
  }
}

/** Return tool definitions for registration */
export function getPeopleToolDefinitions() {
  return [
    {
      name: 'search_people',
      description:
        'Search for people in Planning Center People by name or email. Returns active people matching the query with contact info. Searches against search_name which matches partial first/last name or email.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Name or email to search for' },
          limit: { type: 'number', description: 'Max results (default 20)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_person',
      description:
        'Get the full profile for a specific person by their Planning Center person ID. Includes all emails, phones, addresses, and household data. Use after search_people for complete info.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          personId: { type: 'string', description: 'The person ID' },
        },
        required: ['personId'],
      },
    },
    {
      name: 'list_saved_lists',
      description:
        'Get all saved people lists in Planning Center. Lists are pre-built segments (e.g., "First Time Guests," "Volunteers"). Returns names and IDs for use with get_people_by_list.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
    {
      name: 'get_people_by_list',
      description:
        'Get all people in a saved Planning Center People list. Use list_saved_lists first to find the listId.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          listId: { type: 'string', description: 'The list ID (from list_saved_lists)' },
        },
        required: ['listId'],
      },
    },
    {
      name: 'get_people_stats',
      description:
        'Get a CRM dashboard overview of your Planning Center people database: total count, breakdown by status (active vs inactive), breakdown by membership type (Member, Regular Attender, Visitor, etc.), and how many were added in the last 30 days. This is the go-to tool for "how many people do we have" and similar questions.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
    {
      name: 'get_people_by_status',
      description:
        'Get people filtered by their PCO status (active or inactive). Returns people sorted by most recently updated. Useful for finding inactive records, cleanup audits, or re-engagement campaigns.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          status: { type: 'string', enum: ['active', 'inactive'], description: 'Filter by status: "active" or "inactive"' },
          limit: { type: 'number', description: 'Max results (default 50)' },
        },
        required: ['status'],
      },
    },
    {
      name: 'get_people_by_membership',
      description:
        'Get people filtered by their membership type (e.g., "Member", "Regular Attender", "Visitor"). Returns people sorted by last name. Useful for membership reports and engagement analysis.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          membership: { type: 'string', description: 'Membership type (e.g., "Member", "Regular Attender", "Visitor")' },
          limit: { type: 'number', description: 'Max results (default 50)' },
        },
        required: ['membership'],
      },
    },
    {
      name: 'get_new_people',
      description:
        'Find people added to Planning Center in the last N days, ordered by most recent first. Useful for tracking new guest/visitor volume.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          days: { type: 'number', description: 'Number of days to look back (default 30)' },
          limit: { type: 'number', description: 'Max results (default 100)' },
        },
        required: [] as string[],
      },
    },
    {
      name: 'identify_at_risk_members',
      description:
        'Find active people who have NOT checked in within the last N weeks. These are "at-risk" members who may be disengaging. Cross-references check-in data with the people database. Use for pastoral care follow-up, re-engagement campaigns, or data health checks.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          inactiveWeeks: { type: 'number', description: 'Weeks of inactivity to flag (default 6)' },
          limit: { type: 'number', description: 'Max results (default 100)' },
        },
        required: [] as string[],
      },
    },
    {
      name: 'get_engagement_summary',
      description:
        'Cross-module church health dashboard: total people (active vs inactive), group count, check-ins last 7 days, first-time visitors last 30 days, new people added last 30 days, and upcoming registration events. One tool call that gives a full pulse on your church. Use this for "give me an overview" or "how are we doing" questions.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
  ];
}
