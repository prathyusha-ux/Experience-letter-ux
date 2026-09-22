// db.js
// Centralizes all Supabase Storage + database calls used by server.js,
// so each route doesn't repeat the same fetch/headers boilerplate.
//
// Requires these environment variables to be set:
//   SUPABASE_URL            - your project's API URL (Project Settings -> Data API)
//   SUPABASE_SERVICE_KEY    - the Secret key (NOT the Published/anon key)
//
// NOTE: create the experience_sends table first — run this in the
// Supabase SQL editor:
//
//   create table experience_sends (
//     id uuid primary key default gen_random_uuid(),
//     employee_name text,
//     employee_id text,
//     designation text,
//     recipient_email text,
//     pdf_path text,
//     status text,
//     resend_id text,
//     date_of_joining date,
//     last_working_date date,
//     created_at timestamptz default now()
//   );
//
// Using the Service key (not the anon key) means this bypasses Row Level
// Security entirely, so no RLS policy is needed on this table — it's only
// ever called from this trusted server, never from the browser.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);
}

/**
 * Safely extracts error details from a failed fetch response,
 * falling back to raw text if the body isn't valid JSON.
 */
async function parseErrorBody(response) {
  const clone = response.clone();
  try {
    return await response.json();
  } catch {
    try {
      return { raw: await clone.text() };
    } catch {
      return {};
    }
  }
}

/**
 * Uploads a PDF buffer to a Supabase Storage bucket.
 * Returns the file's path within the bucket on success.
 * Throws on failure — the caller should catch and respond appropriately.
 *
 * @param {boolean} upsert - if true, overwrites an existing file at the same path.
 *   Defaults to false so accidental filename collisions fail loudly instead of
 *   silently overwriting someone else's experience letter.
 */
async function uploadPdfToStorage(buffer, fileName, bucket = 'experience-letters', upsert = false) {
  if (!isConfigured()) {
    throw new Error('Supabase is not configured (missing SUPABASE_URL / SUPABASE_SERVICE_KEY).');
  }

  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${fileName}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/pdf',
      'x-upsert': String(upsert),
    },
    body: buffer,
  });

  if (!response.ok) {
    const errorBody = await parseErrorBody(response);
    const err = new Error('Failed to upload PDF to Supabase Storage');
    err.status = response.status;
    err.details = errorBody;
    throw err;
  }

  return fileName;
}

/**
 * Inserts one row into the experience_sends table.
 * Throws on failure — the caller decides whether a logging failure
 * should also fail the whole request, or just be logged and ignored.
 *
 * Returns the inserted row (with its generated id/created_at) since
 * we request `return=representation`.
 */
async function logExperienceSend({
  employeeName,
  employeeId,
  designation,
  recipientEmail,
  pdfPath,
  status,
  resendId,
  doj,
  lastWorkingDate,
}) {
  if (!isConfigured()) {
    throw new Error('Supabase is not configured (missing SUPABASE_URL / SUPABASE_SERVICE_KEY).');
  }

  const payload = {
    employee_name: employeeName,
    employee_id: employeeId || null,
    designation: designation,
    recipient_email: recipientEmail || null,
    pdf_path: pdfPath || null,
    status,
  };

  if (doj) {
    payload.date_of_joining = doj;
  }
  if (lastWorkingDate) {
    payload.last_working_date = lastWorkingDate;
  }
  if (resendId) {
    payload.resend_id = resendId;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/experience_sends`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await parseErrorBody(response);
    const err = new Error('Failed to log experience_sends row');
    err.status = response.status;
    err.details = errorBody;
    throw err;
  }

  const rows = await response.json().catch(() => []);
  return rows[0] || null;
}

module.exports = {
  isConfigured,
  uploadPdfToStorage,
  logExperienceSend,
};
