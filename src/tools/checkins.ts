import { z } from 'zod';
import { PlanningCenterClient } from '../client.js';
import { toolSuccess, toolError } from '../response.js';

/** Handle a Check-Ins module tool call */
export async function handleCheckInsTool(
  name: string,
  args: Record<string, unknown>,
  client: PlanningCenterClient
): Promise<string> {
  const start = Date.now();

  try {
    switch (name) {
      case 'get_checkin_events': {
        const { items, totalCount } = await client.paginate(
          '/check-ins/v2/events',
          { order: 'name' }
        );

        return JSON.stringify(toolSuccess(items, {
          count: items.length,
          totalCount,
          pcoEndpoint: '/check-ins/v2/events',
          executionMs: Date.now() - start,
        }));
      }

      case 'get_attendance_summary': {
        const schema = z.object({
          eventId: z.string(),
          startDate: z.string(),
          endDate: z.string(),
        });
        const parsed = schema.parse(args);

        const { items: periods } = await client.paginate(
          `/check-ins/v2/events/${parsed.eventId}/event_periods`,
          {
            'where[starts_at][gte]': parsed.startDate,
            'where[starts_at][lte]': parsed.endDate,
            include: 'event_times',
          }
        );

        let totalHeadcount = 0;
        const breakdownByType: Array<{ date: string; regular: number; guest: number; volunteer: number }> = [];

        for (const period of periods) {
          const p = period as any;
          const regular = (p.regular_count as number) ?? 0;
          const guest = (p.guest_count as number) ?? 0;
          const volunteer = (p.volunteer_count as number) ?? 0;
          const total = regular + guest + volunteer;
          totalHeadcount += total;
          breakdownByType.push({
            date: p.starts_at as string,
            regular,
            guest,
            volunteer,
          });
        }

        return JSON.stringify(toolSuccess(
          {
            totalHeadcount,
            breakdownByType,
            periodsIncluded: periods.length,
            dateRange: { start: parsed.startDate, end: parsed.endDate },
          },
          {
            count: periods.length,
            pcoEndpoint: `/check-ins/v2/events/${parsed.eventId}/event_periods`,
            executionMs: Date.now() - start,
          }
        ));
      }

      case 'get_first_time_visitors': {
        const schema = z.object({
          eventId: z.string().optional(),
          startDate: z.string(),
          endDate: z.string(),
        });
        const parsed = schema.parse(args);

        const params: Record<string, string | number> = {
          'where[kind]': 'first_time',
          'where[checked_in_at][gte]': parsed.startDate,
          'where[checked_in_at][lte]': parsed.endDate,
          include: 'person',
          per_page: 100,
        };

        const endpoint = parsed.eventId
          ? `/check-ins/v2/events/${parsed.eventId}/check_ins`
          : '/check-ins/v2/check_ins';

        const { items, included, totalCount } = await client.paginateWithIncludes(endpoint, params);

        const visitors = items.map((checkin: any) => {
          return {
            id: checkin.id,
            first_name: checkin.first_name,
            last_name: checkin.last_name,
            checked_in_at: checkin.checked_in_at,
            kind: checkin.kind,
          };
        });

        return JSON.stringify(toolSuccess(visitors, {
          count: visitors.length,
          totalCount,
          pcoEndpoint: endpoint,
          executionMs: Date.now() - start,
        }));
      }

      case 'get_check_in_trend': {
        const schema = z.object({
          eventId: z.string(),
          weeks: z.number().optional().default(12),
        });
        const parsed = schema.parse(args);

        const startDate = new Date();
        startDate.setUTCDate(startDate.getUTCDate() - parsed.weeks * 7);

        const { items: periods } = await client.paginate(
          `/check-ins/v2/events/${parsed.eventId}/event_periods`,
          {
            'where[starts_at][gte]': startDate.toISOString(),
            order: 'starts_at',
          }
        );

        const trend = periods.map((p: any) => {
          const regular = (p.regular_count as number) ?? 0;
          const guest = (p.guest_count as number) ?? 0;
          const volunteer = (p.volunteer_count as number) ?? 0;
          return {
            date: p.starts_at as string,
            totalHeadcount: regular + guest + volunteer,
            regular,
            guest,
            volunteer,
          };
        });

        return JSON.stringify(toolSuccess(trend, {
          count: trend.length,
          pcoEndpoint: `/check-ins/v2/events/${parsed.eventId}/event_periods`,
          executionMs: Date.now() - start,
        }));
      }

      default:
        return JSON.stringify(toolError(`Unknown check-ins tool: ${name}`));
    }
  } catch (err) {
    return JSON.stringify(
      toolError(PlanningCenterClient.formatError(err, 'Check-Ins'), {
        pcoEndpoint: name,
        executionMs: Date.now() - start,
      })
    );
  }
}

/** Return tool definitions for registration */
export function getCheckInsToolDefinitions() {
  return [
    {
      name: 'get_checkin_events',
      description:
        'List all check-in events configured in Planning Center Check-Ins. Returns event names and IDs needed by other check-in tools. Start here for any check-in analysis.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
    {
      name: 'get_attendance_summary',
      description:
        'Get total headcount attendance for a check-in event over a date range. Returns total and breakdown by type (regular, guest, volunteer). Useful for weekly reporting.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          eventId: { type: 'string', description: 'The check-in event ID' },
          startDate: { type: 'string', description: 'Start date (ISO 8601, e.g. 2024-01-01T00:00:00Z)' },
          endDate: { type: 'string', description: 'End date (ISO 8601)' },
        },
        required: ['eventId', 'startDate', 'endDate'],
      },
    },
    {
      name: 'get_first_time_visitors',
      description:
        'Get people who checked in for the first time during a date range. Useful for tracking guest volume and follow-up workflows.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          eventId: { type: 'string', description: 'Check-in event ID (optional — omit for all events)' },
          startDate: { type: 'string', description: 'Start date (ISO 8601)' },
          endDate: { type: 'string', description: 'End date (ISO 8601)' },
        },
        required: ['startDate', 'endDate'],
      },
    },
    {
      name: 'get_check_in_trend',
      description:
        'Get week-by-week headcount data for a check-in event. Returns one row per service period for spotting attendance trends over time.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          eventId: { type: 'string', description: 'The check-in event ID' },
          weeks: { type: 'number', description: 'Number of weeks to look back (default 12)' },
        },
        required: ['eventId'],
      },
    },
  ];
}
