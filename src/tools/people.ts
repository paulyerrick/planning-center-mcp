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
  ];
}
