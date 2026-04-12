import dotenv from 'dotenv';
import { PlanningCenterClient } from './client.js';

dotenv.config();

async function testConnection() {
  const appId = process.env.PCO_APP_ID;
  const secret = process.env.PCO_SECRET;

  if (!appId || !secret) {
    console.error('Missing PCO_APP_ID or PCO_SECRET in environment / .env file.');
    console.error('Copy .env.example to .env and fill in your credentials.');
    process.exit(1);
  }

  const client = new PlanningCenterClient(appId, secret);

  console.log('Testing Planning Center API connection...\n');

  // Test 1: Authenticate with /people/v2/me
  try {
    const me = await client.get<any>('/people/v2/me');
    const person = client.flatten(me.data);
    console.log(`  Authenticated as: ${person.name}`);
    console.log(`  Person ID: ${person.id}`);
  } catch (err) {
    console.error('  Authentication FAILED.');
    console.error(`  Error: ${PlanningCenterClient.formatError(err)}`);
    process.exit(1);
  }

  // Test 2: Check Services module access
  try {
    const response = await client.get<any>('/services/v2/service_types', { per_page: 1 });
    const count = response.meta?.total_count ?? 0;
    console.log(`  Services module: OK (${count} service type${count !== 1 ? 's' : ''} found)`);
  } catch (err) {
    console.error(`  Services module: ${PlanningCenterClient.formatError(err, 'Services')}`);
  }

  // Test 3: Check People module access
  try {
    const response = await client.get<any>('/people/v2/people', { per_page: 1 });
    const count = response.meta?.total_count ?? 0;
    console.log(`  People module: OK (${count} people in database)`);
  } catch (err) {
    console.error(`  People module: ${PlanningCenterClient.formatError(err, 'People')}`);
  }

  // Test 4: Check Groups module access
  try {
    const response = await client.get<any>('/groups/v2/groups', { per_page: 1 });
    const count = response.meta?.total_count ?? 0;
    console.log(`  Groups module: OK (${count} group${count !== 1 ? 's' : ''} found)`);
  } catch (err) {
    console.error(`  Groups module: ${PlanningCenterClient.formatError(err, 'Groups')}`);
  }

  // Test 5: Check Registrations module access
  try {
    const response = await client.get<any>('/registrations/v2/events', { per_page: 1 });
    const count = response.meta?.total_count ?? 0;
    console.log(`  Registrations module: OK (${count} event${count !== 1 ? 's' : ''} found)`);
  } catch (err) {
    console.error(`  Registrations module: ${PlanningCenterClient.formatError(err, 'Registrations')}`);
  }

  // Test 6: Check Check-Ins module access
  try {
    const response = await client.get<any>('/check-ins/v2/events', { per_page: 1 });
    const count = response.meta?.total_count ?? 0;
    console.log(`  Check-Ins module: OK (${count} event${count !== 1 ? 's' : ''} found)`);
  } catch (err) {
    console.error(`  Check-Ins module: ${PlanningCenterClient.formatError(err, 'Check-Ins')}`);
  }

  console.log('\nConnection test complete.');
}

testConnection().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
