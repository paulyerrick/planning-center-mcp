import { z } from 'zod';
import { PlanningCenterClient } from '../client.js';
import { toolSuccess, toolError } from '../response.js';

/** Handle a Giving module tool call */
export async function handleGivingTool(
  name: string,
  args: Record<string, unknown>,
  client: PlanningCenterClient
): Promise<string> {
  const start = Date.now();

  try {
    switch (name) {
      case 'get_giving_summary': {
        const schema = z.object({
          startDate: z.string(),
          endDate: z.string(),
        });
        const parsed = schema.parse(args);

        // Get donations in date range
        const { items: donations, totalCount } = await client.paginate(
          '/giving/v2/donations',
          {
            'where[received_at][gte]': parsed.startDate,
            'where[received_at][lte]': parsed.endDate,
            order: '-received_at',
            per_page: 100,
          },
          20
        );

        let totalAmount = 0;
        let donationCount = 0;
        const methodBreakdown: Record<string, { count: number; total: number }> = {};
        const fundTotals: Record<string, number> = {};

        for (const d of donations) {
          const donation = d as any;
          const amount = parseFloat(donation.amount_cents as string ?? '0') / 100;
          totalAmount += amount;
          donationCount++;

          const method = (donation.payment_method as string) ?? 'unknown';
          if (!methodBreakdown[method]) methodBreakdown[method] = { count: 0, total: 0 };
          methodBreakdown[method].count++;
          methodBreakdown[method].total += amount;
        }

        const avgDonation = donationCount > 0
          ? Math.round((totalAmount / donationCount) * 100) / 100
          : 0;

        return JSON.stringify(toolSuccess(
          {
            dateRange: { start: parsed.startDate, end: parsed.endDate },
            totalDonations: donationCount,
            totalDonationsInApi: totalCount,
            totalAmount: Math.round(totalAmount * 100) / 100,
            averageDonation: avgDonation,
            byPaymentMethod: methodBreakdown,
          },
          {
            count: donationCount,
            totalCount,
            pcoEndpoint: '/giving/v2/donations',
            executionMs: Date.now() - start,
          }
        ));
      }

      case 'get_donations': {
        const schema = z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          limit: z.number().optional().default(100),
        });
        const parsed = schema.parse(args);

        const params: Record<string, string | number> = {
          order: '-received_at',
          per_page: parsed.limit,
          include: 'designations',
        };
        if (parsed.startDate) params['where[received_at][gte]'] = parsed.startDate;
        if (parsed.endDate) params['where[received_at][lte]'] = parsed.endDate;

        const response = await client.get<any>('/giving/v2/donations', params);
        const donations = Array.isArray(response.data)
          ? response.data.map((r: any) => {
              const flat = client.flatten(r);
              // Resolve designations if included
              const desigRels = r.relationships?.designations?.data ?? [];
              const designations = desigRels.map((ref: any) =>
                client.resolveIncludes(ref.id, 'Designation', response.included ?? [])
              ).filter(Boolean);
              return { ...flat, designations };
            })
          : [];

        return JSON.stringify(toolSuccess(donations, {
          count: donations.length,
          totalCount: response.meta?.total_count,
          pcoEndpoint: '/giving/v2/donations',
          executionMs: Date.now() - start,
        }));
      }

      case 'get_funds': {
        const { items, totalCount } = await client.paginate(
          '/giving/v2/funds',
          { order: 'name' }
        );

        return JSON.stringify(toolSuccess(items, {
          count: items.length,
          totalCount,
          pcoEndpoint: '/giving/v2/funds',
          executionMs: Date.now() - start,
        }));
      }

      case 'get_fund_donations': {
        const schema = z.object({
          fundId: z.string(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        });
        const parsed = schema.parse(args);

        const params: Record<string, string | number> = {
          order: '-received_at',
          per_page: 100,
        };
        if (parsed.startDate) params['where[received_at][gte]'] = parsed.startDate;
        if (parsed.endDate) params['where[received_at][lte]'] = parsed.endDate;

        const { items, totalCount } = await client.paginate(
          `/giving/v2/funds/${parsed.fundId}/donations`,
          params
        );

        let totalAmount = 0;
        for (const d of items) {
          totalAmount += parseFloat((d as any).amount_cents ?? '0') / 100;
        }

        return JSON.stringify(toolSuccess(
          {
            donations: items,
            totalAmount: Math.round(totalAmount * 100) / 100,
          },
          {
            count: items.length,
            totalCount,
            pcoEndpoint: `/giving/v2/funds/${parsed.fundId}/donations`,
            executionMs: Date.now() - start,
          }
        ));
      }

      case 'get_donors': {
        const schema = z.object({
          limit: z.number().optional().default(50),
        });
        const parsed = schema.parse(args);

        const response = await client.get<any>('/giving/v2/people', {
          per_page: parsed.limit,
          include: 'donations',
        });

        const donors = Array.isArray(response.data)
          ? response.data.map((r: any) => client.flatten(r))
          : [];

        return JSON.stringify(toolSuccess(donors, {
          count: donors.length,
          totalCount: response.meta?.total_count,
          pcoEndpoint: '/giving/v2/people',
          executionMs: Date.now() - start,
        }));
      }

      case 'get_giving_trends': {
        const schema = z.object({
          weeks: z.number().optional().default(52),
        });
        const parsed = schema.parse(args);

        const startDate = new Date();
        startDate.setUTCDate(startDate.getUTCDate() - parsed.weeks * 7);

        const { items: donations } = await client.paginate(
          '/giving/v2/donations',
          {
            'where[received_at][gte]': startDate.toISOString(),
            order: 'received_at',
            per_page: 100,
          },
          20
        );

        // Bucket by week
        const weeklyData: Record<string, { total: number; count: number }> = {};

        for (const d of donations) {
          const donation = d as any;
          const receivedAt = new Date(donation.received_at as string);
          // Get the Monday of the week
          const day = receivedAt.getUTCDay();
          const monday = new Date(receivedAt);
          monday.setUTCDate(monday.getUTCDate() - ((day + 6) % 7));
          const weekKey = monday.toISOString().split('T')[0];

          if (!weeklyData[weekKey]) weeklyData[weekKey] = { total: 0, count: 0 };
          weeklyData[weekKey].total += parseFloat(donation.amount_cents ?? '0') / 100;
          weeklyData[weekKey].count++;
        }

        const weeks = Object.entries(weeklyData)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([week, data]) => ({
            weekOf: week,
            totalAmount: Math.round(data.total * 100) / 100,
            donationCount: data.count,
            averageDonation: data.count > 0
              ? Math.round((data.total / data.count) * 100) / 100
              : 0,
          }));

        // Compute moving average
        const movingAvg4: Array<{ weekOf: string; avg: number }> = [];
        for (let i = 3; i < weeks.length; i++) {
          const window = weeks.slice(i - 3, i + 1);
          const avg = Math.round(
            (window.reduce((a, b) => a + b.totalAmount, 0) / 4) * 100
          ) / 100;
          movingAvg4.push({ weekOf: weeks[i].weekOf, avg });
        }

        const totalAmount = weeks.reduce((a, b) => a + b.totalAmount, 0);
        const totalDonations = weeks.reduce((a, b) => a + b.donationCount, 0);

        // Period-over-period growth
        let periodGrowth: string | null = null;
        if (weeks.length >= 8) {
          const mid = Math.floor(weeks.length / 2);
          const firstHalf = weeks.slice(0, mid).reduce((a, b) => a + b.totalAmount, 0) / mid;
          const secondHalf = weeks.slice(mid).reduce((a, b) => a + b.totalAmount, 0) / (weeks.length - mid);
          const growth = firstHalf > 0
            ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100 * 10) / 10
            : 0;
          periodGrowth = `${growth > 0 ? '+' : ''}${growth}%`;
        }

        return JSON.stringify(toolSuccess(
          {
            weeksAnalyzed: weeks.length,
            totalAmount: Math.round(totalAmount * 100) / 100,
            totalDonations,
            weeklyAverage: weeks.length > 0
              ? Math.round((totalAmount / weeks.length) * 100) / 100
              : 0,
            periodOverPeriodGrowth: periodGrowth,
            movingAverage4Week: movingAvg4,
            weeklyData: weeks,
          },
          {
            count: weeks.length,
            pcoEndpoint: '/giving/v2/donations',
            executionMs: Date.now() - start,
          }
        ));
      }

      case 'get_donor_retention': {
        const schema = z.object({
          currentStartDate: z.string(),
          currentEndDate: z.string(),
          priorStartDate: z.string(),
          priorEndDate: z.string(),
        });
        const parsed = schema.parse(args);

        // Get donors in prior period
        const { items: priorDonations } = await client.paginate(
          '/giving/v2/donations',
          {
            'where[received_at][gte]': parsed.priorStartDate,
            'where[received_at][lte]': parsed.priorEndDate,
            per_page: 100,
          },
          20
        );
        const priorDonorIds = new Set<string>();
        for (const d of priorDonations) {
          const personId = (d as any).person_id as string;
          if (personId) priorDonorIds.add(personId);
        }

        // Get donors in current period
        const { items: currentDonations } = await client.paginate(
          '/giving/v2/donations',
          {
            'where[received_at][gte]': parsed.currentStartDate,
            'where[received_at][lte]': parsed.currentEndDate,
            per_page: 100,
          },
          20
        );
        const currentDonorIds = new Set<string>();
        for (const d of currentDonations) {
          const personId = (d as any).person_id as string;
          if (personId) currentDonorIds.add(personId);
        }

        // Compute retention
        let retained = 0;
        let lapsed = 0;
        let newDonors = 0;

        for (const id of priorDonorIds) {
          if (currentDonorIds.has(id)) retained++;
          else lapsed++;
        }
        for (const id of currentDonorIds) {
          if (!priorDonorIds.has(id)) newDonors++;
        }

        const retentionRate = priorDonorIds.size > 0
          ? Math.round((retained / priorDonorIds.size) * 100 * 10) / 10
          : 0;

        return JSON.stringify(toolSuccess(
          {
            priorPeriod: { start: parsed.priorStartDate, end: parsed.priorEndDate, uniqueDonors: priorDonorIds.size },
            currentPeriod: { start: parsed.currentStartDate, end: parsed.currentEndDate, uniqueDonors: currentDonorIds.size },
            retainedDonors: retained,
            lapsedDonors: lapsed,
            newDonors,
            retentionRate: `${retentionRate}%`,
          },
          {
            pcoEndpoint: '/giving/v2/donations',
            executionMs: Date.now() - start,
          }
        ));
      }

      default:
        return JSON.stringify(toolError(`Unknown giving tool: ${name}`));
    }
  } catch (err) {
    return JSON.stringify(
      toolError(PlanningCenterClient.formatError(err, 'Giving'), {
        pcoEndpoint: name,
        executionMs: Date.now() - start,
      })
    );
  }
}

/** Return tool definitions for registration */
export function getGivingToolDefinitions() {
  return [
    {
      name: 'get_giving_summary',
      description:
        'Get a summary of giving/donations for a date range: total amount, donation count, average donation, and breakdown by payment method. Use for "how much did we receive this month" or "giving report" questions.',
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
      name: 'get_donations',
      description:
        'Get individual donation records with optional date filtering. Returns donor info, amounts, payment methods, and fund designations. Use for detailed giving analysis.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          startDate: { type: 'string', description: 'Start date filter (ISO 8601, optional)' },
          endDate: { type: 'string', description: 'End date filter (ISO 8601, optional)' },
          limit: { type: 'number', description: 'Max results (default 100)' },
        },
        required: [] as string[],
      },
    },
    {
      name: 'get_funds',
      description:
        'List all giving funds configured in Planning Center Giving (e.g., "General Fund", "Missions", "Building Fund"). Returns fund names and IDs needed by get_fund_donations.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
    {
      name: 'get_fund_donations',
      description:
        'Get donations for a specific fund with optional date filtering. Returns individual donations and total amount for the fund. Use get_funds first to find fundId.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          fundId: { type: 'string', description: 'The fund ID (from get_funds)' },
          startDate: { type: 'string', description: 'Start date filter (ISO 8601, optional)' },
          endDate: { type: 'string', description: 'End date filter (ISO 8601, optional)' },
        },
        required: ['fundId'],
      },
    },
    {
      name: 'get_donors',
      description:
        'List people who have given in Planning Center Giving. Returns donor profiles with giving history. Use for donor analysis and stewardship.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: { type: 'number', description: 'Max results (default 50)' },
        },
        required: [] as string[],
      },
    },
    {
      name: 'get_giving_trends',
      description:
        'Giving analytics over time: weekly totals, 4-week moving average, period-over-period growth rate, and donation counts. Defaults to 52 weeks. Use for "is giving growing" or "giving trends" questions.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          weeks: { type: 'number', description: 'Weeks of history (default 52)' },
        },
        required: [] as string[],
      },
    },
    {
      name: 'get_donor_retention',
      description:
        'Compare donors across two time periods to calculate retention rate: how many donors from the prior period continued giving in the current period. Also shows lapsed donors and new donors. Use for "are we retaining donors" or "donor churn" questions.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          currentStartDate: { type: 'string', description: 'Current period start (ISO 8601)' },
          currentEndDate: { type: 'string', description: 'Current period end (ISO 8601)' },
          priorStartDate: { type: 'string', description: 'Prior period start (ISO 8601)' },
          priorEndDate: { type: 'string', description: 'Prior period end (ISO 8601)' },
        },
        required: ['currentStartDate', 'currentEndDate', 'priorStartDate', 'priorEndDate'],
      },
    },
  ];
}
