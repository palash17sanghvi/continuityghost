// Runs once when the Next.js server starts and finishes before it accepts requests.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { warmLocalDatabase } = await import('./lib/pool');
  await warmLocalDatabase();
}
