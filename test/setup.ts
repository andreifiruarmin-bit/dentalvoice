import 'dotenv/config';

// Ensure environment variables are loaded for tests
if (!process.env.ADMIN_API_KEY && process.env.VITE_ADMIN_API_KEY) {
  process.env.ADMIN_API_KEY = process.env.VITE_ADMIN_API_KEY;
}

// Log to verify env vars are loaded
if (process.env.ADMIN_API_KEY) {
  console.log('[test setup] ADMIN_API_KEY loaded:', process.env.ADMIN_API_KEY.substring(0, 10) + '...');
} else {
  console.warn('[test setup] ADMIN_API_KEY not found in environment');
}
