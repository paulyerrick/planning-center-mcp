import { z } from 'zod';
import { PlanningCenterClient } from '../client.js';
import { toolSuccess, toolError } from '../response.js';

/** Handle cross-module analytics tool calls */
export async function handleAnalyticsTool(
  name: string,
  args: Record<string, unknown>,
  client: PlanningCenterClient
): Promise<string> {
  const start = Date.now();

  try {
    switch (name) {
      case 'pco_correlate_giving_attendance': {
        const schema = z.object({
          startDate: z.string(),
          endDate: z.string(),
        });
        const parsed = schema.parse(args);

        // Get donors in the period
        const { items: donations } = await client.paginate(
          '/giving/v2/donations',
          {
            'where[received_at][gte]': parsed.startDate,
            'where[received_at][lte]': parsed.endDate,
            per_page: 100,
          },
          20
        );

        const donorIds = new Set<string>();
        const donorAmounts: Record<string, number> = {};
        for (const d of donations) {
          const personId = (d as any).person_id as string;
          if (personId) {
            donorIds.add(personId);
            donorAmounts[personId] = (donorAmounts[personId] ?? 0) +
              parseFloat((d as any).amount_cents ?? '0') / 100;
          }
        }

        // Get check-ins in the period
        const { items: checkins } = await client.paginate(
          '/check-ins/v2/check_ins',
          {
            'where[checked_in_at][gte]': parsed.startDate,
            'where[checked_in_at][lte]': parsed.endDate,
            per_page: 100,
          },
          20
        );

        const attendeeIds = new Set<string>();
        const attendeeCounts: Record<string, number> = {};
        for (const c of checkins) {
          const personId = (c as any).person_id as string;
          if (personId) {
            attendeeIds.add(personId);
            attendeeCounts[personId] = (attendeeCounts[personId] ?? 0) + 1;
          }
        }

        // Cross-reference
        let donorsWhoAttend = 0;
        let donorsWhoDoNotAttend = 0;
        let attendeesWhoGive = 0;
        let attendeesWhoDoNotGive = 0;

        for (const donorId of donorIds) {
          if (attendeeIds.has(donorId)) donorsWhoAttend++;
          else donorsWhoDoNotAttend++;
        }
        for (const attendeeId of attendeeIds) {
          if (donorIds.has(attendeeId)) attendeesWhoGive++;
          else attendeesWhoDoNotGive++;
        }

        // Giving amounts for attendees vs non-attendees
        let givingFromAttendees = 0;
        let givingFromNonAttendees = 0;
        for (const [personId, amount] of Object.entries(donorAmounts)) {
          if (attendeeIds.has(personId)) givingFromAttendees += amount;
          else givingFromNonAttendees += amount;
        }

        // Average attendance for donors vs total
        const donorAttendanceCounts: number[] = [];
        for (const donorId of donorIds) {
          donorAttendanceCounts.push(attendeeCounts[donorId] ?? 0);
        }
        const avgAttendanceForDonors = donorAttendanceCounts.length > 0
          ? Math.round((donorAttendanceCounts.reduce((a, b) => a + b, 0) / donorAttendanceCounts.length) * 10) / 10
          : 0;

        return JSON.stringify(toolSuccess(
          {
            dateRange: { start: parsed.startDate, end: parsed.endDate },
            uniqueDonors: donorIds.size,
            uniqueAttendees: attendeeIds.size,
            overlap: {
              donorsWhoAlsoAttend: donorsWhoAttend,
              donorsWhoDoNotAttend: donorsWhoDoNotAttend,
              attendeesWhoAlsoGive: attendeesWhoGive,
              attendeesWhoDoNotGive: attendeesWhoDoNotGive,
            },
            givingByAttendance: {
              fromAttendees: Math.round(givingFromAttendees * 100) / 100,
              fromNonAttendees: Math.round(givingFromNonAttendees * 100) / 100,
              percentFromAttendees: donorIds.size > 0
                ? `${Math.round((givingFromAttendees / (givingFromAttendees + givingFromNonAttendees)) * 100)}%`
                : 'N/A',
            },
            averageAttendanceForDonors: avgAttendanceForDonors,
          },
          {
            pcoEndpoint: '/giving/v2/donations + /check-ins/v2/check_ins',
            executionMs: Date.now() - start,
          }
        ));
      }

      case 'pco_correlate_groups_attendance': {
        const schema = z.object({
          startDate: z.string(),
          endDate: z.string(),
        });
        const parsed = schema.parse(args);

        // Get all group members
        const { items: groups } = await client.paginate(
          '/groups/v2/groups',
          { per_page: 100 }
        );

        const groupMemberIds = new Set<string>();
        for (const group of groups.slice(0, 50)) {
          try {
            const { items: memberships } = await client.paginate(
              `/groups/v2/groups/${(group as any).id}/memberships`,
              { per_page: 100 },
              2
            );
            for (const m of memberships) {
              const personId = (m as any).person_id as string;
              if (personId) groupMemberIds.add(personId);
            }
          } catch {
            // Skip inaccessible groups
          }
        }

        // Get check-ins in the period
        const { items: checkins } = await client.paginate(
          '/check-ins/v2/check_ins',
          {
            'where[checked_in_at][gte]': parsed.startDate,
            'where[checked_in_at][lte]': parsed.endDate,
            per_page: 100,
          },
          20
        );

        const attendeeIds = new Set<string>();
        for (const c of checkins) {
          const personId = (c as any).person_id as string;
          if (personId) attendeeIds.add(personId);
        }

        // Cross-reference
        let groupMembersWhoAttend = 0;
        let groupMembersWhoDoNotAttend = 0;
        let attendeesInGroups = 0;
        let attendeesNotInGroups = 0;

        for (const memberId of groupMemberIds) {
          if (attendeeIds.has(memberId)) groupMembersWhoAttend++;
          else groupMembersWhoDoNotAttend++;
        }
        for (const attendeeId of attendeeIds) {
          if (groupMemberIds.has(attendeeId)) attendeesInGroups++;
          else attendeesNotInGroups++;
        }

        return JSON.stringify(toolSuccess(
          {
            dateRange: { start: parsed.startDate, end: parsed.endDate },
            groupsAnalyzed: Math.min(groups.length, 50),
            uniqueGroupMembers: groupMemberIds.size,
            uniqueAttendees: attendeeIds.size,
            overlap: {
              groupMembersWhoAlsoAttend: groupMembersWhoAttend,
              groupMembersWhoDoNotAttend: groupMembersWhoDoNotAttend,
              attendeesAlsoInGroups: attendeesInGroups,
              attendeesNotInGroups: attendeesNotInGroups,
            },
            groupAttendanceRate: groupMemberIds.size > 0
              ? `${Math.round((groupMembersWhoAttend / groupMemberIds.size) * 100)}%`
              : 'N/A',
            attendeeGroupParticipation: attendeeIds.size > 0
              ? `${Math.round((attendeesInGroups / attendeeIds.size) * 100)}%`
              : 'N/A',
          },
          {
            pcoEndpoint: '/groups/v2 + /check-ins/v2',
            executionMs: Date.now() - start,
          }
        ));
      }

      case 'pco_correlate_giving_groups': {
        const schema = z.object({
          startDate: z.string(),
          endDate: z.string(),
        });
        const parsed = schema.parse(args);

        // Get donors
        const { items: donations } = await client.paginate(
          '/giving/v2/donations',
          {
            'where[received_at][gte]': parsed.startDate,
            'where[received_at][lte]': parsed.endDate,
            per_page: 100,
          },
          20
        );

        const donorIds = new Set<string>();
        const donorAmounts: Record<string, number> = {};
        for (const d of donations) {
          const personId = (d as any).person_id as string;
          if (personId) {
            donorIds.add(personId);
            donorAmounts[personId] = (donorAmounts[personId] ?? 0) +
              parseFloat((d as any).amount_cents ?? '0') / 100;
          }
        }

        // Get group members
        const { items: groups } = await client.paginate(
          '/groups/v2/groups',
          { per_page: 100 }
        );

        const groupMemberIds = new Set<string>();
        for (const group of groups.slice(0, 50)) {
          try {
            const { items: memberships } = await client.paginate(
              `/groups/v2/groups/${(group as any).id}/memberships`,
              { per_page: 100 },
              2
            );
            for (const m of memberships) {
              const personId = (m as any).person_id as string;
              if (personId) groupMemberIds.add(personId);
            }
          } catch {
            // Skip
          }
        }

        // Cross-reference
        let donorsInGroups = 0;
        let donorsNotInGroups = 0;
        let givingFromGroupMembers = 0;
        let givingFromNonGroupMembers = 0;

        for (const donorId of donorIds) {
          const amount = donorAmounts[donorId] ?? 0;
          if (groupMemberIds.has(donorId)) {
            donorsInGroups++;
            givingFromGroupMembers += amount;
          } else {
            donorsNotInGroups++;
            givingFromNonGroupMembers += amount;
          }
        }

        const avgGivingGroupMembers = donorsInGroups > 0
          ? Math.round((givingFromGroupMembers / donorsInGroups) * 100) / 100
          : 0;
        const avgGivingNonGroupMembers = donorsNotInGroups > 0
          ? Math.round((givingFromNonGroupMembers / donorsNotInGroups) * 100) / 100
          : 0;

        return JSON.stringify(toolSuccess(
          {
            dateRange: { start: parsed.startDate, end: parsed.endDate },
            uniqueDonors: donorIds.size,
            uniqueGroupMembers: groupMemberIds.size,
            overlap: {
              donorsWhoAreGroupMembers: donorsInGroups,
              donorsNotInGroups: donorsNotInGroups,
            },
            givingComparison: {
              totalFromGroupMembers: Math.round(givingFromGroupMembers * 100) / 100,
              totalFromNonGroupMembers: Math.round(givingFromNonGroupMembers * 100) / 100,
              avgPerDonorInGroups: avgGivingGroupMembers,
              avgPerDonorNotInGroups: avgGivingNonGroupMembers,
            },
          },
          {
            pcoEndpoint: '/giving/v2 + /groups/v2',
            executionMs: Date.now() - start,
          }
        ));
      }

      default:
        return JSON.stringify(toolError(`Unknown analytics tool: ${name}`));
    }
  } catch (err) {
    return JSON.stringify(
      toolError(PlanningCenterClient.formatError(err, 'Analytics (cross-module)'), {
        pcoEndpoint: name,
        executionMs: Date.now() - start,
      })
    );
  }
}

/** Return tool definitions */
export function getAnalyticsToolDefinitions() {
  return [
    {
      name: 'pco_correlate_giving_attendance',
      description:
        'Cross-reference giving and attendance data: how many donors also attend, how much giving comes from regular attendees vs non-attendees, average attendance frequency for donors. Use for "do people who attend give more" or "what percentage of our giving comes from regular attenders" questions.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          startDate: { type: 'string', description: 'Start date (ISO 8601)' },
          endDate: { type: 'string', description: 'End date (ISO 8601)' },
        },
        required: ['startDate', 'endDate'],
      },
    },
    {
      name: 'pco_correlate_groups_attendance',
      description:
        'Cross-reference group membership and attendance: what percentage of group members also attend services, and what percentage of attendees are in a group. Use for "are group members more engaged" or "how many attendees are not in a group" questions.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          startDate: { type: 'string', description: 'Start date for attendance window (ISO 8601)' },
          endDate: { type: 'string', description: 'End date for attendance window (ISO 8601)' },
        },
        required: ['startDate', 'endDate'],
      },
    },
    {
      name: 'pco_correlate_giving_groups',
      description:
        'Cross-reference giving and group membership: do group members give more than non-group-members? Returns average giving per donor for group members vs non-members. Use for "do small group members give more" questions.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          startDate: { type: 'string', description: 'Start date (ISO 8601)' },
          endDate: { type: 'string', description: 'End date (ISO 8601)' },
        },
        required: ['startDate', 'endDate'],
      },
    },
  ];
}
