/** Shared Planning Center entity types — flattened shape (post JSON:API extraction) */

export interface PCOPerson {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  email_addresses: PCOEmail[];
  phone_numbers: PCOPhoneNumber[];
  membership: string | null;
  status: string | null;
  avatar: string | null;
  created_at: string;
  updated_at: string;
  birthdate: string | null;
  grade: number | null;
  campus_id: string | null;
}

export interface PCOEmail {
  id: string;
  address: string;
  location: string;
  primary: boolean;
}

export interface PCOPhoneNumber {
  id: string;
  number: string;
  carrier: string | null;
  location: string;
  primary: boolean;
}

export interface PCOServiceType {
  id: string;
  name: string;
  frequency: string;
  created_at: string;
}

export interface PCOPlan {
  id: string;
  title: string | null;
  series_title: string | null;
  dates: string;
  sort_date: string;
  service_type_id: string;
  total_length: number | null;
  team_member_count: number | null;
  needed_positions_count: number | null;
}

export interface PCOTeam {
  id: string;
  name: string;
  required_for_promotion: boolean;
  schedule_to: string;
}

export interface PCOTeamMember {
  id: string;
  status: string;
  name: string;
  team_position_name: string | null;
  photo_thumbnail: string | null;
}

export interface PCOSong {
  id: string;
  title: string;
  author: string | null;
  ccli_number: string | null;
  copyright: string | null;
  created_at: string;
  last_scheduled_at: string | null;
  hidden: boolean;
}

export interface PCOGroup {
  id: string;
  name: string;
  group_type_id: string;
  enrollment_strategy: string;
  events_visibility: string;
  location: string | null;
  schedule: string | null;
  memberships_count: number;
  public_church_center_web_url: string | null;
  created_at: string;
}

export interface PCOGroupMembership {
  id: string;
  person_id: string;
  role: string;
  joined_at: string;
}

export interface PCOGroupEvent {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  virtual_location_url: string | null;
  attendance_requests_count: number | null;
}

export interface PCOEvent {
  id: string;
  name: string;
  registration_url: string | null;
  capacity: number | null;
  registration_count: number | null;
  open_signup: boolean;
  created_at: string;
}

export interface PCOAttendee {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  completed_at: string | null;
  paid: boolean | null;
}

export interface PCOCheckIn {
  id: string;
  first_name: string;
  last_name: string;
  checked_in_at: string;
  kind: string;
  event_period_id: string | null;
}

export interface PCOHeadcount {
  id: string;
  total: number;
  updated_at: string;
  attendance_type_id: string | null;
}

/** Raw JSON:API response shapes */
export interface JsonApiRecord {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, { data: { id: string; type: string } | Array<{ id: string; type: string }> }>;
}

export interface JsonApiResponse<T = JsonApiRecord> {
  data: T | T[];
  included?: JsonApiRecord[];
  meta?: { total_count?: number; count?: number };
  links?: { next?: string };
}
