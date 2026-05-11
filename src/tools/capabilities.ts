import { toolSuccess, toolError } from '../response.js';

export async function handleCapabilitiesTool(name: string): Promise<string> {
  if (name !== 'pco_capabilities_guide') {
    return JSON.stringify(toolError(`Unknown capabilities tool: ${name}`));
  }

  return JSON.stringify(toolSuccess({
    title: 'Planning Center MCP Capabilities Guide',
    bestFirstPrompts: [
      'Check my Planning Center connection status.',
      'What can this Planning Center connector do?',
      'List our Planning Center service types and identify likely active weekend services.',
      'Using service type ID ___, run a weekend readiness report for the next 7 days.',
      'Who visited for the first time this month and has not returned yet?',
      'Create a dashboard snapshot for this month and render it visually.',
      'Pull a service review packet for our most recent weekend service.',
      'Record service feedback from our post-weekend review.',
    ],
    capabilities: [
      {
        category: 'Connection + setup',
        whatItDoes: 'Checks whether the connector can authenticate and which Planning Center modules are readable.',
        tools: ['pco_connection_status'],
        examplePrompts: ['Check my Planning Center connection status.', 'Which Planning Center modules can you access?'],
      },
      {
        category: 'Weekend readiness',
        whatItDoes: 'Finds upcoming service plans, pending/declined/unfilled volunteer slots, and urgent Sunday risks.',
        tools: ['pco_get_service_types', 'pco_get_upcoming_services', 'pco_weekend_readiness'],
        requiredInputs: ['serviceTypeId'],
        examplePrompts: [
          'List service types and find our main weekend service type ID.',
          'Using service type ID ___, what might break this Sunday?',
        ],
      },
      {
        category: 'People + follow-up',
        whatItDoes: 'Searches people, lists new people, identifies first-time guests, and detects return visits.',
        tools: ['pco_search_people', 'pco_get_person', 'pco_get_new_people', 'pco_guest_followup'],
        examplePrompts: [
          'Search for Jane Smith in Planning Center.',
          'Who visited for the first time this month and has not returned yet?',
        ],
      },
      {
        category: 'Dashboards + visuals',
        whatItDoes: 'Returns chart-ready JSON that Claude can turn into dashboards, graphs, and staff reports.',
        tools: ['pco_dashboard_snapshot', 'pco_ministry_health_summary', 'pco_get_attendance_trends', 'pco_get_giving_trends'],
        examplePrompts: [
          'Create a visual dashboard snapshot for this month.',
          'Graph attendance and giving trends for the last quarter.',
        ],
      },
      {
        category: 'Post-service review + memory',
        whatItDoes: 'Pulls a service review packet and stores wins/issues/recommendations so future planning can recall what worked.',
        tools: ['pco_service_review_packet', 'pco_record_service_feedback'],
        requiredInputs: ['serviceTypeId', 'planId'],
        examplePrompts: [
          'Pull a service review packet for last Sunday.',
          'Record this feedback: worship response was a win, transitions were confusing, repeat testimony videos, avoid announcements after response moments.',
        ],
      },
      {
        category: 'Groups + engagement',
        whatItDoes: 'Lists groups, group members, leader gaps, enrollment stats, and group/attendance overlap.',
        tools: ['pco_list_groups', 'pco_get_group_members', 'pco_get_groups_without_leader', 'pco_get_group_enrollment_stats', 'pco_correlate_groups_attendance'],
        examplePrompts: ['Which groups have no leader?', 'Summarize group engagement and attendance overlap.'],
      },
      {
        category: 'Giving + ministry health',
        whatItDoes: 'Summarizes giving, donations, funds, trends, and giving/attendance overlap when permissions allow.',
        tools: ['pco_get_giving_summary', 'pco_get_donations', 'pco_get_funds', 'pco_get_giving_trends', 'pco_correlate_giving_attendance'],
        examplePrompts: ['Summarize giving for this quarter.', 'Compare giving and attendance for this month.'],
      },
      {
        category: 'Registrations + events',
        whatItDoes: 'Lists upcoming registration events, attendees, capacity, and paid/unpaid registration summaries.',
        tools: ['pco_list_events', 'pco_get_event_registrations', 'pco_get_registration_summary'],
        examplePrompts: ['Which registration events are coming up?', 'Summarize registrations and capacity for event ID ___.'],
      },
      {
        category: 'Planning Center cleanup',
        whatItDoes: 'Helps identify stale service types, duplicate naming patterns, empty groups, and permission/module gaps.',
        tools: ['pco_get_service_types', 'pco_get_upcoming_services', 'pco_connection_status', 'pco_get_group_enrollment_stats'],
        examplePrompts: ['Audit our service types for duplicates or inactive entries.', 'Which groups appear empty or need cleanup?'],
      },
    ],
    recommendedWorkflow: [
      'Start with pco_connection_status.',
      'List service types and identify active weekend serviceTypeIds.',
      'Run pco_weekend_readiness weekly before services.',
      'Run pco_guest_followup weekly after services.',
      'Use pco_dashboard_snapshot for staff/elder dashboards.',
      'Use pco_service_review_packet and pco_record_service_feedback after weekend review meetings.',
    ],
    troubleshooting: [
      'If a module says access denied, the connected Planning Center user likely lacks that module permission.',
      'Weekend readiness needs a Services serviceTypeId; ask to list service types first.',
      'Service review needs both serviceTypeId and planId; ask for upcoming or recent services first.',
      'Giving tools require Giving access and may be unavailable for some users.',
      'For visual dashboards, ask Claude to render the chart-ready JSON as an artifact or dashboard.',
    ],
  }, {
    pcoEndpoint: 'capabilities-guide',
  }));
}

export function getCapabilitiesToolDefinitions() {
  return [
    {
      name: 'pco_capabilities_guide',
      description:
        'Explain what the Planning Center MCP can do, best first prompts, workflow categories, required IDs, visuals/dashboard capabilities, and troubleshooting. Use when a user asks what this connector can do.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
  ];
}
