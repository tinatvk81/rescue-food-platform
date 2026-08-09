/**
 * api.js
 * ------
 * Shared fetch wrapper used by every page. Always sends cookies
 * (credentials: 'include') so the httpOnly JWT cookie set by the
 * backend (Step 1/2) is included automatically — pages never touch
 * the token directly.
 */

const API_BASE = '/api/v1';

/**
 * @param {string} path - e.g. '/bags/nearby?lat=..'
 * @param {object} [options]
 * @returns {Promise<any>} the parsed `data` field of a successful response
 * @throws {Error} with the backend's error message on failure
 */
async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.status === 'fail' || body.status === 'error') {
    throw new Error(body.message || `Request failed (${response.status})`);
  }

  // Most endpoints wrap their payload in a `data` field (e.g. { status,
  // data: { user } }), but a few (like /auth/request-otp and /auth/logout)
  // return fields directly at the top level instead. Falling back to the
  // whole body when `data` is absent means every page here works with
  // either response shape, instead of breaking with a confusing
  // "Cannot read properties of undefined" error.
  return body.data !== undefined ? body.data : body;
}

/**
 * Reads the currently logged-in user by trying a lightweight
 * authenticated call. There's no dedicated "GET /auth/me" endpoint
 * yet, so pages that need to know "am I logged in?" keep track of it
 * themselves right after login/signup (see auth.js), storing just the
 * non-sensitive parts in sessionStorage for convenience across page
 * loads within the same tab. This is NOT the source of truth for
 * authorization — the httpOnly cookie is — it's only used to decide
 * what the UI should show (e.g. "hi, Tina" vs a login link).
 */
function getStoredUser() {
  const raw = sessionStorage.getItem('rf_user');
  return raw ? JSON.parse(raw) : null;
}

function storeUser(user) {
  sessionStorage.setItem('rf_user', JSON.stringify(user));
}

function clearStoredUser() {
  sessionStorage.removeItem('rf_user');
}

function formatToman(rials) {
  // Prices throughout the backend are plain numbers with no implied
  // currency; displayed here as-is with a "تومان" suffix per the
  // values used throughout this project's own testing (e.g. 50000).
  return new Intl.NumberFormat('fa-IR').format(rials);
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} متر`;
  return `${(meters / 1000).toFixed(1)} کیلومتر`;
}

function formatTimeRemaining(seconds) {
  if (seconds <= 0) return 'به پایان رسید';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} روز مانده`;
  }
  if (hours >= 1) return `${hours} ساعت و ${minutes} دقیقه مانده`;
  return `${minutes} دقیقه مانده`;
}
