import { z } from 'zod';
import { PlanningCenterClient } from '../client.js';
import { toolSuccess, toolError } from '../response.js';
import { JsonApiRecord, JsonApiResponse } from '../types.js';

type ReadinessPlan = {
  planId: string;
  title: string;
  dates: string | null;
  sortDate: string | null;
  confirmed: number;
  pending: number;
  declined: number;
  unfilled: number;
  totalTeamMembers: number;
  gaps: Array<{
    name: string;
    status: string;
    teamPositionName: string;
  }>;
};

function statusBucket(status: unknown): 'confirmed' | 'pending' | 'declined' | 'unfilled' | null {
  if (status === 'C') return 'confirmed';
  if (status === 'P') return 'pending';
  if (status === 'D') return 'declined';
  if (status === 'U') return 'unfilled';
  return null;
}

function relationshipId(record: JsonApiRecord, relationshipName: string): string | null {
  const data = record.relationships?.[relationshipName]?.data;
  if (!data || Array.isArray(data)) return null;
  return data.id;
}

function resolveIncluded(type: string, id: string | null, included: JsonApiRecord[]): JsonApiRecord | null {
  if (!id) return null;
  return included.find((item) => item.type === type && item.id === id) ?? null;
}

async function paginateRaw(
  client: PlanningCenterClient,
  path: string,
  params: Record<string, string | number | undefined>,
  maxPages = 5
): Promise<{ records: JsonApiRecord[]; included: JsonApiRecord[]; totalCount: number }> {
  const records: JsonApiRecord[] = [];
  const included: JsonApiRecord[] = [];
  const perPage = Number(params.per_page ?? 100);
  let offset = Number(params.offset ?? 0);
  let totalCount = 0;

  for (let page = 0; page < maxPages; page++) {
    const response = await client.get<JsonApiResponse<JsonApiRecord>>(path, {
      ...params,
      per_page: perPage,
      offset,
    });
    const pageRecords = Array.isArray(response.data) ? response.data : [response.data];
    records.push(...pageRecords);
    if (response.included) included.push(...response.included);
    totalCount = response.meta?.total_count ?? records.length;
    if (records.length >= totalCount) break;
    offset += perPage;
  }

  return { records, included, totalCount };
}

/** Handle opinionated cross-tool workflow calls */
export async function handleWorkflowTool(
  name: string,
  args: Record<string, unknown>,
  client: PlanningCenterClient
): Promise<string> {
  const start = Date.now();

  try {
    switch (name) {
      case 'pco_weekend_readiness': {
        const schema = z.object({
          serviceTypeId: z.string(),
          daysAhead: z.number().min(1).max(60).optional().default(7),
          maxPlans: z.number().min(1).max(20).optional().default(6),
        });
        const parsed = schema.parse(args);

        const cutoff = new Date();
        cutoff.setUTCDate(cutoff.getUTCDate() + parsed.daysAhead);

        const plansEndpoint = `/services/v2/service_types/${parsed.serviceTypeId}/plans`;
        const { items: plans, totalCount } = await client.paginate(
          plansEndpoint,
          { filter: 'future', order: 'sort_date' },
          3
        );

        const targetPlans = plans
          .filter((plan: any) => {
            if (!plan.sort_date) return true;
            return new Date(plan.sort_date as string) <= cutoff;
          })
          .slice(0, parsed.maxPlans);

        const readinessPlans: ReadinessPlan[] = [];
        const apiWarnings: Array<{ planId: string; message: string }> = [];

        for (const plan of targetPlans) {
          const planId = (plan as any).id as string;
          const teamMembersEndpoint = `/services/v2/service_types/${parsed.serviceTypeId}/plans/${planId}/team_members`;

          let members: Array<Record<string, unknown>> = [];
          try {
            const { items } = await client.paginate(teamMembersEndpoint, { per_page: 100 }, 3);
            members = items as Array<Record<string, unknown>>;
          } catch (err) {
            apiWarnings.push({
              planId,
              message: PlanningCenterClient.formatError(err, 'Services'),
            });
          }

          const result: ReadinessPlan = {
            planId,
            title: ((plan as any).title as string) || ((plan as any).series_title as string) || ((plan as any).dates as string) || 'Untitled plan',
            dates: ((plan as any).dates as string) ?? null,
            sortDate: ((plan as any).sort_date as string) ?? null,
            confirmed: 0,
            pending: 0,
            declined: 0,
            unfilled: 0,
            totalTeamMembers: members.length,
            gaps: [],
          };

          for (const member of members) {
            const status = member.status as string | undefined;
            const bucket = statusBucket(status);
            if (bucket) result[bucket]++;

            const name = ((member.name as string) || '').trim();
            const isNeededPosition = name.toLowerCase() === 'needed position' || name.length === 0;
            if (status === 'U' || status === 'D' || isNeededPosition) {
              result.gaps.push({
                name: name || 'Needed Position',
                status: status ?? 'unknown',
                teamPositionName: (member.team_position_name as string) || 'Unknown position',
              });
            }
          }

          readinessPlans.push(result);
        }

        const totals = readinessPlans.reduce(
          (acc, plan) => {
            acc.plans += 1;
            acc.confirmed += plan.confirmed;
            acc.pending += plan.pending;
            acc.declined += plan.declined;
            acc.unfilled += plan.unfilled;
            acc.totalGaps += plan.gaps.length;
            return acc;
          },
          { plans: 0, confirmed: 0, pending: 0, declined: 0, unfilled: 0, totalGaps: 0 }
        );

        const mostUrgent = readinessPlans
          .flatMap((plan) => plan.gaps.map((gap) => ({
            planId: plan.planId,
            planTitle: plan.title,
            planDate: plan.sortDate ?? plan.dates,
            ...gap,
          })))
          .slice(0, 25);

        const recommendedActions = [
          totals.totalGaps > 0
            ? `Contact owners for ${totals.totalGaps} open/declined/pending volunteer slots.`
            : 'No volunteer gaps found in the selected window.',
          totals.pending > 0
            ? `Follow up with ${totals.pending} pending volunteer confirmations.`
            : 'No pending confirmations found.',
          apiWarnings.length > 0
            ? `Review ${apiWarnings.length} plan(s) with API access/read errors.`
            : 'No Services API read errors encountered.',
        ];

        return JSON.stringify(toolSuccess(
          {
            window: { daysAhead: parsed.daysAhead, serviceTypeId: parsed.serviceTypeId },
            totals,
            mostUrgent,
            plans: readinessPlans,
            apiWarnings,
            recommendedActions,
          },
          {
            count: readinessPlans.length,
            totalCount,
            pcoEndpoint: `${plansEndpoint} + */team_members`,
            executionMs: Date.now() - start,
          }
        ));
      }

      case 'pco_guest_followup': {
        const schema = z.object({
          eventId: z.string().optional(),
          startDate: z.string(),
          endDate: z.string(),
          followUpDays: z.number().min(1).max(180).optional().default(60),
          limit: z.number().min(1).max(200).optional().default(100),
        });
        const parsed = schema.parse(args);

        const endpoint = parsed.eventId
          ? `/check-ins/v2/events/${parsed.eventId}/check_ins`
          : '/check-ins/v2/check_ins';

        const firstTimers = await paginateRaw(client, endpoint, {
          'where[kind]': 'first_time',
          'where[checked_in_at][gte]': parsed.startDate,
          'where[checked_in_at][lte]': parsed.endDate,
          include: 'person',
          per_page: Math.min(parsed.limit, 100),
        });

        const endDate = new Date(parsed.endDate);
        const followUpEnd = new Date(endDate);
        followUpEnd.setUTCDate(followUpEnd.getUTCDate() + parsed.followUpDays);

        const firstTimerPersonIds = new Set<string>();
        const firstVisitByPerson = new Map<string, string>();

        for (const record of firstTimers.records) {
          const personId = relationshipId(record, 'person') ?? (record.attributes.person_id as string | undefined) ?? null;
          if (!personId) continue;
          firstTimerPersonIds.add(personId);
          const checkedInAt = (record.attributes.checked_in_at as string | undefined) ?? 'unknown';
          if (!firstVisitByPerson.has(personId)) firstVisitByPerson.set(personId, checkedInAt);
        }

        const returnVisits = await paginateRaw(client, endpoint, {
          'where[kind]': 'regular',
          'where[checked_in_at][gte]': parsed.endDate,
          'where[checked_in_at][lte]': followUpEnd.toISOString(),
          include: 'person',
          per_page: 100,
        });

        const returnVisitByPerson = new Map<string, string>();
        for (const record of returnVisits.records) {
          const personId = relationshipId(record, 'person') ?? (record.attributes.person_id as string | undefined) ?? null;
          if (!personId || !firstTimerPersonIds.has(personId) || returnVisitByPerson.has(personId)) continue;
          returnVisitByPerson.set(personId, (record.attributes.checked_in_at as string | undefined) ?? 'unknown');
        }

        const visitors = Array.from(firstTimerPersonIds).map((personId) => {
          const person = resolveIncluded('Person', personId, firstTimers.included);
          const firstVisit = firstVisitByPerson.get(personId) ?? 'unknown';
          const returnVisit = returnVisitByPerson.get(personId) ?? null;
          const name = (person?.attributes.name as string | undefined)
            ?? `${person?.attributes.first_name ?? ''} ${person?.attributes.last_name ?? ''}`.trim()
            ?? 'Unknown visitor';
          const daysSinceFirstVisit = firstVisit !== 'unknown'
            ? Math.max(0, Math.floor((Date.now() - new Date(firstVisit).getTime()) / 86_400_000))
            : null;

          return {
            personId,
            name,
            firstVisit,
            returned: Boolean(returnVisit),
            returnVisit,
            daysSinceFirstVisit,
            priority: returnVisit ? 'nurture' : 'follow_up',
            recommendedAction: returnVisit
              ? 'Thank them for returning and suggest a next step such as a group or serving conversation.'
              : 'Personal follow-up recommended; no return visit found in the follow-up window.',
          };
        });

        const needsFollowUp = visitors.filter((visitor) => !visitor.returned);
        const returned = visitors.filter((visitor) => visitor.returned);
        const retentionRate = visitors.length > 0
          ? Math.round((returned.length / visitors.length) * 1000) / 10
          : 0;

        return JSON.stringify(toolSuccess(
          {
            window: {
              eventId: parsed.eventId ?? null,
              startDate: parsed.startDate,
              endDate: parsed.endDate,
              followUpThrough: followUpEnd.toISOString(),
            },
            totals: {
              firstTimeVisitors: visitors.length,
              returned: returned.length,
              needsFollowUp: needsFollowUp.length,
              retentionRate: `${retentionRate}%`,
            },
            needsFollowUp,
            returned,
            recommendedActions: [
              needsFollowUp.length > 0
                ? `Follow up with ${needsFollowUp.length} first-time visitor(s) who have not returned yet.`
                : 'All first-time visitors in this window have a detected return visit.',
              returned.length > 0
                ? `Invite ${returned.length} returning visitor(s) into a next step: group, serving, or membership path.`
                : 'No return visits detected yet in the follow-up window.',
            ],
          },
          {
            count: visitors.length,
            totalCount: firstTimers.totalCount,
            pcoEndpoint: endpoint,
            executionMs: Date.now() - start,
          }
        ));
      }

      case 'pco_ministry_health_summary': {
        const schema = z.object({
          startDate: z.string(),
          endDate: z.string(),
          maxPages: z.number().min(1).max(20).optional().default(10),
        });
        const parsed = schema.parse(args);
        const moduleWarnings: Array<{ module: string; message: string }> = [];

        let people: {
          totalPeople: number | null;
          newPeople: number | null;
        } = { totalPeople: null, newPeople: null };

        try {
          const total = await client.get<any>('/people/v2/people', { per_page: 1 });
          const recent = await client.get<any>('/people/v2/people', {
            per_page: 1,
            'where[created_at][gte]': parsed.startDate,
            'where[created_at][lte]': parsed.endDate,
          });
          people = {
            totalPeople: total.meta?.total_count ?? 0,
            newPeople: recent.meta?.total_count ?? 0,
          };
        } catch (err) {
          moduleWarnings.push({ module: 'People', message: PlanningCenterClient.formatError(err, 'People') });
        }

        let attendance: {
          totalCheckIns: number | null;
          uniquePeople: number | null;
          firstTimeGuests: number | null;
        } = { totalCheckIns: null, uniquePeople: null, firstTimeGuests: null };

        try {
          const { records: checkins, totalCount } = await paginateRaw(client, '/check-ins/v2/check_ins', {
            'where[checked_in_at][gte]': parsed.startDate,
            'where[checked_in_at][lte]': parsed.endDate,
            per_page: 100,
          }, parsed.maxPages);
          const firstTimers = await client.get<any>('/check-ins/v2/check_ins', {
            per_page: 1,
            'where[kind]': 'first_time',
            'where[checked_in_at][gte]': parsed.startDate,
            'where[checked_in_at][lte]': parsed.endDate,
          });
          const uniquePeople = new Set<string>();
          for (const checkin of checkins) {
            const personId = relationshipId(checkin, 'person') ?? (checkin.attributes.person_id as string | undefined) ?? null;
            if (personId) uniquePeople.add(personId);
          }
          attendance = {
            totalCheckIns: totalCount,
            uniquePeople: uniquePeople.size,
            firstTimeGuests: firstTimers.meta?.total_count ?? 0,
          };
        } catch (err) {
          moduleWarnings.push({ module: 'Check-Ins', message: PlanningCenterClient.formatError(err, 'Check-Ins') });
        }

        let giving: {
          totalDonations: number | null;
          totalAmount: number | null;
          averageDonation: number | null;
        } = { totalDonations: null, totalAmount: null, averageDonation: null };

        try {
          const { items: donations, totalCount } = await client.paginate('/giving/v2/donations', {
            'where[received_at][gte]': parsed.startDate,
            'where[received_at][lte]': parsed.endDate,
            per_page: 100,
            order: '-received_at',
          }, parsed.maxPages);

          const totalAmount = donations.reduce((sum, donation: any) => {
            const cents = Number.parseFloat(String(donation.amount_cents ?? '0'));
            return sum + (Number.isFinite(cents) ? cents / 100 : 0);
          }, 0);

          giving = {
            totalDonations: totalCount,
            totalAmount: Math.round(totalAmount * 100) / 100,
            averageDonation: donations.length > 0
              ? Math.round((totalAmount / donations.length) * 100) / 100
              : 0,
          };
        } catch (err) {
          moduleWarnings.push({ module: 'Giving', message: PlanningCenterClient.formatError(err, 'Giving') });
        }

        let groups: {
          totalGroups: number | null;
          groupsAnalyzed: number | null;
          totalMemberships: number | null;
          emptyGroups: number | null;
          averageGroupSize: number | null;
        } = {
          totalGroups: null,
          groupsAnalyzed: null,
          totalMemberships: null,
          emptyGroups: null,
          averageGroupSize: null,
        };

        try {
          const { items, totalCount } = await client.paginate('/groups/v2/groups', {
            order: 'name',
            per_page: 100,
          }, parsed.maxPages);

          const totalMemberships = items.reduce((sum, group: any) => sum + Number(group.memberships_count ?? 0), 0);
          const emptyGroups = items.filter((group: any) => Number(group.memberships_count ?? 0) === 0).length;
          groups = {
            totalGroups: totalCount,
            groupsAnalyzed: items.length,
            totalMemberships,
            emptyGroups,
            averageGroupSize: items.length > 0 ? Math.round((totalMemberships / items.length) * 10) / 10 : 0,
          };
        } catch (err) {
          moduleWarnings.push({ module: 'Groups', message: PlanningCenterClient.formatError(err, 'Groups') });
        }

        const recommendedActions = [
          attendance.firstTimeGuests != null && attendance.firstTimeGuests > 0
            ? `Review follow-up for ${attendance.firstTimeGuests} first-time guest(s).`
            : 'No first-time guest count available or none found in this window.',
          groups.emptyGroups != null && groups.emptyGroups > 0
            ? `Audit ${groups.emptyGroups} group(s) with zero members.`
            : 'No empty groups found in analyzed groups, or Groups data unavailable.',
          giving.totalDonations != null && giving.totalDonations === 0
            ? 'Giving returned zero donations for this period; verify date range and Giving permissions.'
            : 'Review giving totals alongside attendance for directional health, not individual judgment.',
          moduleWarnings.length > 0
            ? `Resolve ${moduleWarnings.length} module access/data warning(s) for a complete health view.`
            : 'All requested module reads completed successfully.',
        ];

        return JSON.stringify(toolSuccess(
          {
            window: { startDate: parsed.startDate, endDate: parsed.endDate },
            people,
            attendance,
            giving,
            groups,
            moduleWarnings,
            recommendedActions,
          },
          {
            pcoEndpoint: '/people/v2 + /check-ins/v2 + /giving/v2 + /groups/v2',
            executionMs: Date.now() - start,
          }
        ));
      }

      case 'pco_connection_status': {
        const checks = [
          { module: 'Account', endpoint: '/people/v2/me', params: {} },
          { module: 'Services', endpoint: '/services/v2/service_types', params: { per_page: 1 } },
          { module: 'People', endpoint: '/people/v2/people', params: { per_page: 1 } },
          { module: 'Groups', endpoint: '/groups/v2/groups', params: { per_page: 1 } },
          { module: 'Registrations', endpoint: '/registrations/v2/events', params: { per_page: 1 } },
          { module: 'Check-Ins', endpoint: '/check-ins/v2/events', params: { per_page: 1 } },
          { module: 'Giving', endpoint: '/giving/v2/funds', params: { per_page: 1 } },
        ];

        const results: Array<{
          module: string;
          ok: boolean;
          count: number | null;
          authenticatedAs?: string | null;
          error: string | null;
        }> = [];

        for (const check of checks) {
          try {
            const response = await client.get<any>(check.endpoint, check.params);
            const record = Array.isArray(response.data) ? response.data[0] : response.data;
            const flattened = record ? client.flatten(record) : null;
            results.push({
              module: check.module,
              ok: true,
              count: response.meta?.total_count ?? (Array.isArray(response.data) ? response.data.length : 1),
              authenticatedAs: check.module === 'Account' ? ((flattened?.name as string | undefined) ?? null) : undefined,
              error: null,
            });
          } catch (err) {
            results.push({
              module: check.module,
              ok: false,
              count: null,
              error: PlanningCenterClient.formatError(err, check.module),
            });
          }
        }

        const failed = results.filter((result) => !result.ok);
        const connected = results.find((result) => result.module === 'Account')?.ok === true;

        return JSON.stringify(toolSuccess(
          {
            connected,
            modules: results,
            summary: failed.length === 0
              ? 'Planning Center connection is healthy for all checked modules.'
              : `Planning Center connected with ${failed.length} module warning(s).`,
            recommendedActions: failed.map((failure) => `${failure.module}: ${failure.error}`),
          },
          {
            count: results.length,
            pcoEndpoint: 'module access checks',
            executionMs: Date.now() - start,
          }
        ));
      }

      default:
        return JSON.stringify(toolError(`Unknown workflow tool: ${name}`));
    }
  } catch (err) {
    return JSON.stringify(
      toolError(PlanningCenterClient.formatError(err), {
        pcoEndpoint: name,
        executionMs: Date.now() - start,
      })
    );
  }
}

/** Return workflow tool definitions for registration */
export function getWorkflowToolDefinitions() {
  return [
    {
      name: 'pco_weekend_readiness',
      description:
        'One-shot weekend readiness report for Planning Center Services. Finds upcoming plans, volunteer gaps, declined/pending confirmations, and recommended actions. Ask: “What might break this Sunday?” Use get_service_types first to find serviceTypeId.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          serviceTypeId: { type: 'string', description: 'The service type ID from pco_get_service_types' },
          daysAhead: { type: 'number', description: 'Days ahead to inspect, default 7, max 60' },
          maxPlans: { type: 'number', description: 'Max plans to analyze, default 6, max 20' },
        },
        required: ['serviceTypeId'],
      },
    },
    {
      name: 'pco_guest_followup',
      description:
        'First-time guest follow-up workflow for Planning Center Check-Ins. Finds first-time visitors in a date window, detects return visits, and returns recommended follow-up actions. Ask: “Who visited recently and needs follow-up?”',
      inputSchema: {
        type: 'object' as const,
        properties: {
          eventId: { type: 'string', description: 'Optional Check-Ins event ID; omit to search all check-ins' },
          startDate: { type: 'string', description: 'Start date/time ISO string' },
          endDate: { type: 'string', description: 'End date/time ISO string' },
          followUpDays: { type: 'number', description: 'Days after endDate to scan for return visits, default 60' },
          limit: { type: 'number', description: 'Max first-time check-ins to inspect, default 100' },
        },
        required: ['startDate', 'endDate'],
      },
    },
    {
      name: 'pco_ministry_health_summary',
      description:
        'Executive health summary across Planning Center People, Check-Ins, Giving, and Groups for a date range. Returns high-level counts, warnings, and recommended actions for staff or elder meetings.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          startDate: { type: 'string', description: 'Start date/time ISO string' },
          endDate: { type: 'string', description: 'End date/time ISO string' },
          maxPages: { type: 'number', description: 'Max pages per module to inspect, default 10' },
        },
        required: ['startDate', 'endDate'],
      },
    },
    {
      name: 'pco_connection_status',
      description:
        'Check Planning Center authentication and module access. Use this after install to verify credentials and identify which PCO modules the token can read.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
  ];
}
