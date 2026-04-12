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
      case 'pco_get_checkin_events': {
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

      case 'pco_get_attendance_summary': {
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

      case 'pco_get_first_time_visitors': {
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

      case 'pco_get_check_in_trend': {
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

      case 'pco_analyze_retention': {
        const schema = z.object({
          eventId: z.string(),
          startDate: z.string(),
          endDate: z.string(),
        });
        const parsed = schema.parse(args);

        // Get all first-time check-ins in the date range
        const { items: firstTimeCheckins } = await client.paginateWithIncludes(
          `/check-ins/v2/events/${parsed.eventId}/check_ins`,
          {
            'where[kind]': 'first_time',
            'where[checked_in_at][gte]': parsed.startDate,
            'where[checked_in_at][lte]': parsed.endDate,
            include: 'person',
            per_page: 100,
          }
        );

        // Collect unique person IDs from first-timers
        const firstTimerPersonIds = new Set<string>();
        for (const checkin of firstTimeCheckins) {
          const c = checkin as any;
          if (c.person_id) firstTimerPersonIds.add(c.person_id as string);
        }

        // Now check which of those people checked in again AFTER the date range
        const endDateObj = new Date(parsed.endDate);
        const followUpEnd = new Date(endDateObj);
        followUpEnd.setUTCDate(followUpEnd.getUTCDate() + 60); // look 60 days after window

        let returnedCount = 0;
        const returnedPeople: Array<{ personId: string; firstVisit: string; returnVisit: string }> = [];

        // Get all check-ins after the end date to find returnees
        if (firstTimerPersonIds.size > 0) {
          const { items: followUpCheckins } = await client.paginateWithIncludes(
            `/check-ins/v2/events/${parsed.eventId}/check_ins`,
            {
              'where[kind]': 'regular',
              'where[checked_in_at][gte]': parsed.endDate,
              'where[checked_in_at][lte]': followUpEnd.toISOString(),
              per_page: 100,
            }
          );

          const returnedIds = new Set<string>();
          for (const checkin of followUpCheckins) {
            const c = checkin as any;
            const personId = c.person_id as string;
            if (personId && firstTimerPersonIds.has(personId) && !returnedIds.has(personId)) {
              returnedIds.add(personId);
              returnedCount++;
              // Find their first check-in
              const firstCheckin = firstTimeCheckins.find(
                (fc: any) => fc.person_id === personId
              ) as any;
              returnedPeople.push({
                personId,
                firstVisit: firstCheckin?.checked_in_at ?? 'unknown',
                returnVisit: c.checked_in_at as string,
              });
            }
          }
        }

        const totalFirstTimers = firstTimerPersonIds.size;
        const retentionRate = totalFirstTimers > 0
          ? Math.round((returnedCount / totalFirstTimers) * 100 * 10) / 10
          : 0;

        return JSON.stringify(toolSuccess(
          {
            dateRange: { start: parsed.startDate, end: parsed.endDate },
            followUpWindow: `60 days after end date`,
            totalFirstTimeVisitors: totalFirstTimers,
            returnedForSecondVisit: returnedCount,
            didNotReturn: totalFirstTimers - returnedCount,
            retentionRate: `${retentionRate}%`,
            returnedPeople: returnedPeople.slice(0, 50),
          },
          {
            pcoEndpoint: `/check-ins/v2/events/${parsed.eventId}/check_ins`,
            executionMs: Date.now() - start,
          }
        ));
      }

      case 'pco_get_attendance_trends': {
        const schema = z.object({
          eventId: z.string(),
          weeks: z.number().optional().default(52),
        });
        const parsed = schema.parse(args);

        const startDate = new Date();
        startDate.setUTCDate(startDate.getUTCDate() - parsed.weeks * 7);

        const { items: periods } = await client.paginate(
          `/check-ins/v2/events/${parsed.eventId}/event_periods`,
          {
            'where[starts_at][gte]': startDate.toISOString(),
            order: 'starts_at',
          },
          20 // allow more pages for longer history
        );

        const weeklyData: Array<{
          date: string;
          headcount: number;
          regular: number;
          guest: number;
          volunteer: number;
        }> = [];

        for (const p of periods) {
          const period = p as any;
          const regular = (period.regular_count as number) ?? 0;
          const guest = (period.guest_count as number) ?? 0;
          const volunteer = (period.volunteer_count as number) ?? 0;
          weeklyData.push({
            date: period.starts_at as string,
            headcount: regular + guest + volunteer,
            regular,
            guest,
            volunteer,
          });
        }

        // Compute analytics
        const headcounts = weeklyData.map((w) => w.headcount);
        const totalWeeks = headcounts.length;
        const overallAvg = totalWeeks > 0
          ? Math.round(headcounts.reduce((a, b) => a + b, 0) / totalWeeks)
          : 0;

        // 4-week moving average
        const movingAvg4: Array<{ date: string; avg: number }> = [];
        for (let i = 3; i < weeklyData.length; i++) {
          const window = headcounts.slice(i - 3, i + 1);
          const avg = Math.round(window.reduce((a, b) => a + b, 0) / 4);
          movingAvg4.push({ date: weeklyData[i].date, avg });
        }

        // Year-over-year: compare first half vs second half if enough data
        let yoyGrowth: string | null = null;
        if (totalWeeks >= 8) {
          const midpoint = Math.floor(totalWeeks / 2);
          const firstHalf = headcounts.slice(0, midpoint);
          const secondHalf = headcounts.slice(midpoint);
          const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
          const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
          const growth = firstAvg > 0
            ? Math.round(((secondAvg - firstAvg) / firstAvg) * 100 * 10) / 10
            : 0;
          yoyGrowth = `${growth > 0 ? '+' : ''}${growth}%`;
        }

        // Peak and trough
        const peak = totalWeeks > 0 ? Math.max(...headcounts) : 0;
        const trough = totalWeeks > 0 ? Math.min(...headcounts) : 0;
        const peakDate = totalWeeks > 0 ? weeklyData[headcounts.indexOf(peak)].date : null;
        const troughDate = totalWeeks > 0 ? weeklyData[headcounts.indexOf(trough)].date : null;

        return JSON.stringify(toolSuccess(
          {
            weeksAnalyzed: totalWeeks,
            overallAverage: overallAvg,
            peak: { headcount: peak, date: peakDate },
            trough: { headcount: trough, date: troughDate },
            periodOverPeriodGrowth: yoyGrowth,
            movingAverage4Week: movingAvg4,
            weeklyData,
          },
          {
            count: totalWeeks,
            pcoEndpoint: `/check-ins/v2/events/${parsed.eventId}/event_periods`,
            executionMs: Date.now() - start,
          }
        ));
      }

      case 'pco_get_headcount_dashboard': {
        const schema = z.object({
          weeks: z.number().optional().default(4),
        });
        const parsed = schema.parse(args);

        const startDate = new Date();
        startDate.setUTCDate(startDate.getUTCDate() - parsed.weeks * 7);

        // Get all check-in events
        const { items: events } = await client.paginate('/check-ins/v2/events', { order: 'name' });

        const dashboard: Array<{
          eventId: string;
          eventName: string;
          totalHeadcount: number;
          averageHeadcount: number;
          periodsCount: number;
          trend: Array<{ date: string; headcount: number }>;
        }> = [];

        for (const event of events) {
          const eventId = (event as any).id as string;
          const eventName = (event as any).name as string;
          try {
            const { items: periods } = await client.paginate(
              `/check-ins/v2/events/${eventId}/event_periods`,
              {
                'where[starts_at][gte]': startDate.toISOString(),
                order: 'starts_at',
              }
            );

            if (periods.length === 0) continue;

            let totalHeadcount = 0;
            const trend: Array<{ date: string; headcount: number }> = [];

            for (const p of periods) {
              const period = p as any;
              const regular = (period.regular_count as number) ?? 0;
              const guest = (period.guest_count as number) ?? 0;
              const volunteer = (period.volunteer_count as number) ?? 0;
              const headcount = regular + guest + volunteer;
              totalHeadcount += headcount;
              trend.push({
                date: period.starts_at as string,
                headcount,
              });
            }

            dashboard.push({
              eventId,
              eventName,
              totalHeadcount,
              averageHeadcount: Math.round(totalHeadcount / periods.length),
              periodsCount: periods.length,
              trend,
            });
          } catch {
            // Skip events we can't access
          }
        }

        return JSON.stringify(toolSuccess(dashboard, {
          count: dashboard.length,
          pcoEndpoint: '/check-ins/v2/events/*/event_periods',
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
      name: 'pco_get_checkin_events',
      description:
        'List all check-in events configured in Planning Center Check-Ins. Returns event names and IDs needed by other check-in tools. Start here for any check-in analysis.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
    {
      name: 'pco_get_attendance_summary',
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
      name: 'pco_get_first_time_visitors',
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
      name: 'pco_get_check_in_trend',
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
    {
      name: 'pco_analyze_retention',
      description:
        'Analyze first-time visitor retention: how many first-time guests returned for a second visit within 60 days. Returns retention rate percentage, counts, and individual return data. Use for "what is our retention rate" or "are first-time visitors coming back" questions.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          eventId: { type: 'string', description: 'The check-in event ID' },
          startDate: { type: 'string', description: 'Start of the first-visit window (ISO 8601)' },
          endDate: { type: 'string', description: 'End of the first-visit window (ISO 8601)' },
        },
        required: ['eventId', 'startDate', 'endDate'],
      },
    },
    {
      name: 'pco_get_attendance_trends',
      description:
        'Deep attendance analytics for a check-in event: weekly headcounts, 4-week moving average, period-over-period growth rate, peak/trough dates, and guest vs regular breakdown. Defaults to 52 weeks of history. Use for "show me attendance trends" or "is attendance growing or declining" questions.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          eventId: { type: 'string', description: 'The check-in event ID' },
          weeks: { type: 'number', description: 'Weeks of history to analyze (default 52)' },
        },
        required: ['eventId'],
      },
    },
    {
      name: 'pco_get_headcount_dashboard',
      description:
        'Get a multi-event attendance dashboard for the last N weeks. Returns total headcount, average headcount, and week-by-week trend for every check-in event. Great for a quick "how is attendance across the board" overview.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          weeks: { type: 'number', description: 'Number of weeks to look back (default 4)' },
        },
        required: [] as string[],
      },
    },
  ];
}
