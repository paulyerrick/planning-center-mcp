import type { SupabaseClient } from '@supabase/supabase-js';

export type ServiceFeedbackInput = {
  connectionId?: string;
  serviceTypeId: string;
  planId: string;
  planTitle?: string | null;
  planDate?: string | null;
  wins: string[];
  issues: string[];
  doAgain: string[];
  avoidNextTime: string[];
  notes?: string | null;
  tags?: string[];
};

export type ServiceFeedbackRecord = ServiceFeedbackInput & {
  id: string;
  createdAt: string;
};

export interface FeedbackStore {
  saveServiceFeedback(input: ServiceFeedbackInput): Promise<ServiceFeedbackRecord>;
  listServiceFeedback(input: {
    connectionId?: string;
    serviceTypeId?: string;
    planId?: string;
    tags?: string[];
    limit?: number;
  }): Promise<ServiceFeedbackRecord[]>;
}

export class DisabledFeedbackStore implements FeedbackStore {
  async saveServiceFeedback(): Promise<ServiceFeedbackRecord> {
    throw new Error('Service feedback memory is not configured for this MCP server. Use the hosted connector with Supabase enabled.');
  }

  async listServiceFeedback(): Promise<ServiceFeedbackRecord[]> {
    return [];
  }
}

export class SupabaseFeedbackStore implements FeedbackStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async saveServiceFeedback(input: ServiceFeedbackInput): Promise<ServiceFeedbackRecord> {
    if (!input.connectionId) {
      throw new Error('Missing connectionId for service feedback memory.');
    }

    const { data, error } = await this.supabase
      .from('service_feedback')
      .insert({
        pco_connection_id: input.connectionId,
        service_type_id: input.serviceTypeId,
        plan_id: input.planId,
        plan_title: input.planTitle ?? null,
        plan_date: input.planDate ?? null,
        wins: input.wins,
        issues: input.issues,
        do_again: input.doAgain,
        avoid_next_time: input.avoidNextTime,
        notes: input.notes ?? null,
        tags: input.tags ?? [],
      })
      .select('*')
      .single();

    if (error) throw error;
    return rowToFeedback(data);
  }

  async listServiceFeedback(input: {
    connectionId?: string;
    serviceTypeId?: string;
    planId?: string;
    tags?: string[];
    limit?: number;
  }): Promise<ServiceFeedbackRecord[]> {
    if (!input.connectionId) return [];

    let query = this.supabase
      .from('service_feedback')
      .select('*')
      .eq('pco_connection_id', input.connectionId)
      .order('created_at', { ascending: false })
      .limit(input.limit ?? 20);

    if (input.serviceTypeId) query = query.eq('service_type_id', input.serviceTypeId);
    if (input.planId) query = query.eq('plan_id', input.planId);
    if (input.tags?.length) query = query.overlaps('tags', input.tags);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(rowToFeedback);
  }
}

function rowToFeedback(row: any): ServiceFeedbackRecord {
  return {
    id: row.id,
    connectionId: row.pco_connection_id,
    serviceTypeId: row.service_type_id,
    planId: row.plan_id,
    planTitle: row.plan_title,
    planDate: row.plan_date,
    wins: row.wins ?? [],
    issues: row.issues ?? [],
    doAgain: row.do_again ?? [],
    avoidNextTime: row.avoid_next_time ?? [],
    notes: row.notes,
    tags: row.tags ?? [],
    createdAt: row.created_at,
  };
}
