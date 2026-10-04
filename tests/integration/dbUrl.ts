export const TEST_DB = 'slotkeeper_test';

export function adminDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Start the dev database (scripts/ops.ps1 dev-db); see .env.example.',
    );
  }
  return url;
}

export function testDatabaseUrl(): string {
  const url = new URL(adminDatabaseUrl());
  url.pathname = `/${TEST_DB}`;
  return url.toString();
}
