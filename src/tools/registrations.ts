import { z } from 'zod';
import { PlanningCenterClient } from '../client.js';
import { toolSuccess, toolError } from '../response.js';

/** Handle a Registrations module tool call */
export async function handleRegistrationsTool(
  name: string,
  args: Record<string, unknown>,
  client: PlanningCenterClient
): Promise<string> {
  const start = Date.now();

  try {
    switch (name) {
      case 'pco_list_events': {
        const schema = z.object({
          daysAhead: z.number().optional().default(60),
          limit: z.number().optional().default(25),
        });
        const parsed = schema.parse(args);

        const response = await client.get<any>('/registrations/v2/events', {
          order: 'starts_at',
          filter: 'upcoming',
          per_page: parsed.limit,
        });

        const events = Array.isArray(response.data)
          ? response.data.map((r: any) => {
              const flat = client.flatten(r);
              const capacity = flat.capacity as number | null;
              const regCount = flat.registration_count as number | null;
              return {
                ...flat,
                spots_remaining:
                  capacity != null && regCount != null ? capacity - regCount : null,
              };
            })
          : [];

        const cutoff = new Date();
        cutoff.setUTCDate(cutoff.getUTCDate() + parsed.daysAhead);
        const filtered = events.filter((e: any) => {
          if (!e.starts_at) return true;
          return new Date(e.starts_at as string) <= cutoff;
        });

        return JSON.stringify(toolSuccess(filtered, {
          count: filtered.length,
          totalCount: response.meta?.total_count,
          pcoEndpoint: '/registrations/v2/events',
          executionMs: Date.now() - start,
        }));
      }

      case 'pco_get_event_registrations': {
        const schema = z.object({ eventId: z.string() });
        const parsed = schema.parse(args);

        const { items, totalCount } = await client.paginate(
          `/registrations/v2/events/${parsed.eventId}/attendees`,
          { per_page: 100 }
        );

        return JSON.stringify(toolSuccess(items, {
          count: items.length,
          totalCount,
          hasMore: items.length < totalCount,
          pcoEndpoint: `/registrations/v2/events/${parsed.eventId}/attendees`,
          executionMs: Date.now() - start,
        }));
      }

      case 'pco_get_registration_summary': {
        const schema = z.object({ eventId: z.string() });
        const parsed = schema.parse(args);

        // Fetch event for capacity
        const eventResponse = await client.get<any>(
          `/registrations/v2/events/${parsed.eventId}`
        );
        const event = client.flatten(eventResponse.data);

        // Fetch attendees with per_page=1 to get total_count from meta
        const attendeesResponse = await client.get<any>(
          `/registrations/v2/events/${parsed.eventId}/attendees`,
          { per_page: 1 }
        );
        const totalRegistered = attendeesResponse.meta?.total_count ?? 0;
        const capacity = event.capacity as number | null;
        const spotsRemaining = capacity != null ? capacity - totalRegistered : null;

        // For paid/unpaid, paginate if count is reasonable
        let paid = 0;
        let unpaid = 0;
        if (totalRegistered > 0 && totalRegistered <= 1000) {
          const { items } = await client.paginate(
            `/registrations/v2/events/${parsed.eventId}/attendees`,
            { per_page: 100 }
          );
          for (const a of items) {
            if ((a as any).paid) {
              paid++;
            } else {
              unpaid++;
            }
          }
        }

        const summary = {
          eventName: event.name,
          capacity,
          totalRegistered,
          spotsRemaining,
          paid,
          unpaid,
        };

        return JSON.stringify(toolSuccess(summary, {
          pcoEndpoint: `/registrations/v2/events/${parsed.eventId}`,
          executionMs: Date.now() - start,
        }));
      }

      default:
        return JSON.stringify(toolError(`Unknown registrations tool: ${name}`));
    }
  } catch (err) {
    return JSON.stringify(
      toolError(PlanningCenterClient.formatError(err, 'Registrations'), {
        pcoEndpoint: name,
        executionMs: Date.now() - start,
      })
    );
  }
}

/** Return tool definitions for registration */
export function getRegistrationsToolDefinitions() {
  return [
    {
      name: 'pco_list_events',
      description:
        'List upcoming registration events in Planning Center Registrations. Returns event names, dates, registration counts, capacity, and spots remaining.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          daysAhead: { type: 'number', description: 'Days ahead to look (default 60)' },
          limit: { type: 'number', description: 'Max results (default 25)' },
        },
        required: [] as string[],
      },
    },
    {
      name: 'pco_get_event_registrations',
      description:
        'Get all registrations (attendees) for a specific event. Returns names, contact info, payment status, and registration date. Use list_events to find eventId.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          eventId: { type: 'string', description: 'The event ID (from list_events)' },
        },
        required: ['eventId'],
      },
    },
    {
      name: 'pco_get_registration_summary',
      description:
        'Get a quick summary of registration numbers: total registered, capacity, spots remaining, paid vs unpaid. Faster than get_event_registrations when you only need counts.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          eventId: { type: 'string', description: 'The event ID' },
        },
        required: ['eventId'],
      },
    },
  ];
}
