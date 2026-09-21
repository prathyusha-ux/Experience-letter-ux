// Experience Letter Generator — form & letter logic
// Matches the exact wording/layout of the UXINTERFACELY IT SOLUTIONS LLP
// experience letter template. Wires up: HRMS lookup (demo), letter
// generation, edit-in-place, PDF export, and save-to-file.

(function () {
  'use strict';

  // ---------- Element refs ----------
  const form            = document.getElementById('experienceForm');
  const empName         = document.getElementById('empName');
  const employeeId      = document.getElementById('employeeId');
  const designation     = document.getElementById('designation');
  const letterDate      = document.getElementById('letterDate');
  const doj             = document.getElementById('doj');
  const lastWorkingDate = document.getElementById('lastWorkingDate');

  const dojHint = document.getElementById('dojHint');
  const lwdHint = document.getElementById('lwdHint');

  const lookupBtn   = document.getElementById('lookupBtn');
  const generateBtn = document.getElementById('generateBtn');
  const printBtn    = document.getElementById('printBtn');
  const editBtn     = document.getElementById('editBtn');
  const saveBtn     = document.getElementById('saveBtn');

  const previewStatus = document.getElementById('previewStatus');
  const letterEmpty   = document.getElementById('letterEmpty');
  const editHint      = document.getElementById('editHint');
  const letterOutput  = document.getElementById('letterOutput');

  const COMPANY_NAME = 'UXINTERFACELY IT SOLUTIONS LLP';

  let isEditing = false;
  let hasGenerated = false;

  // ---------- Helpers ----------
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // Template uses DD/MM/YYYY throughout ("[DD/MM/YYYY]")
  function formatDateDMY(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr + 'T00:00:00');
    if (isNaN(d.getTime())) return isoStr;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  function setHint(el, text, isMissing, color) {
    el.textContent = text;
    el.classList.toggle('missing', !!isMissing);
    el.style.color = color || '';
  }

  // ---------- Supabase lookup (shared employee database) ----------
  // TODO: fill in your project's URL and public anon key (Project Settings
  // → API in the Supabase dashboard). The anon key is safe to expose in
  // client-side code as long as Row Level Security is enabled on the table
  // with a policy that allows SELECT for the anon role.
  const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
  const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';

  // Isolated so that a missing/blocked CDN script or a bad URL can't throw
  // an uncaught error here and take down the rest of the page's buttons
  // (Generate/PDF/Save/Edit don't depend on Supabase at all).
  let supabase = null;
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      console.warn('Supabase client library not found on window — check that the CDN <script> tag is included in index.html before script.js. HRMS lookup will be unavailable, but the rest of the tool still works.');
    }
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
  }

  // Adjust these three names if your table/columns are called something else.
  const EMPLOYEES_TABLE = 'employees';
  const COL_EMPLOYEE_ID = 'employee_id';
  const COL_DOJ = 'doj';
  const COL_LWD = 'last_working_date';

  async function fetchEmployeeRecord(id) {
    const { data, error } = await supabase
      .from(EMPLOYEES_TABLE)
      .select(`${COL_DOJ}, ${COL_LWD}`)
      .eq(COL_EMPLOYEE_ID, id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return { doj: data[COL_DOJ], lastWorkingDate: data[COL_LWD] };
  }

  lookupBtn.addEventListener('click', async function () {
    const id = employeeId.value.trim();
    if (!id) {
      setHint(dojHint, 'Employee ID required for HRMS lookup', true);
      setHint(lwdHint, 'Employee ID required for HRMS lookup', true);
      employeeId.focus();
      return;
    }

    if (!supabase) {
      setHint(dojHint, 'Database not connected — enter dates manually', true);
      setHint(lwdHint, 'Database not connected — enter dates manually', true);
      return;
    }

    lookupBtn.disabled = true;
    lookupBtn.textContent = 'Looking up…';

    try {
      const record = await fetchEmployeeRecord(id);

      if (!record) {
        setHint(dojHint, 'No record found for this Employee ID', true);
        setHint(lwdHint, 'No record found for this Employee ID', true);
        return;
      }

      doj.value = record.doj;
      lastWorkingDate.value = record.lastWorkingDate;
      setHint(dojHint, 'Pulled from employee database', false);
      setHint(lwdHint, 'Pulled from employee database', false);
    } catch (err) {
      console.error('Supabase lookup failed:', err);
      setHint(dojHint, 'Lookup failed — check console for details', true);
      setHint(lwdHint, 'Lookup failed — check console for details', true);
    } finally {
      lookupBtn.disabled = false;
      lookupBtn.textContent = 'Fetch Dates from HRMS';
    }
  });

  // If the user types/picks a date manually (instead of using the lookup),
  // show a neutral "Entered manually" hint instead of leaving it blank.
  doj.addEventListener('input', () => setHint(dojHint, 'Entered manually', false, '#666666'));
  lastWorkingDate.addEventListener('input', () => setHint(lwdHint, 'Entered manually', false, '#666666'));

  // ---------- Letter generation (matches the UXINTERFACELY template) ----------
  function buildLetterHTML(data) {
    return `
      <div class="page">
        <div class="letterhead">
          <img src="logo.png" alt="UX Interfacely logo" class="logo-img">
        </div>

        <div class="letter-title" style="color:#000; text-decoration:underline;">Experience Letter</div>

        <div class="page-body">
          <p style="margin:0 0 2px;"><strong>Date:</strong> ${escapeHTML(data.letterDateFormatted)}</p>
          <p style="margin:0 0 14px;"><strong>Employee ID.:</strong> ${escapeHTML(data.employeeId)}</p>

          <p>This is to certify that Mr./Ms. <strong>${escapeHTML(data.empName)}</strong> was employed
          with <strong>${COMPANY_NAME}</strong> as <strong>${escapeHTML(data.designation)}</strong>
          from <strong>${escapeHTML(data.dojFormatted)}</strong> to <strong>${escapeHTML(data.lwdFormatted)}</strong>.</p>

          <p>During the period of employment, the employee was associated with the organization in a
          professional capacity and was responsible for carrying out the duties and responsibilities
          assigned to them in accordance with the requirements of their role. The employee contributed
          to various organizational activities and project-related assignments during their tenure.
          Throughout their employment, the employee demonstrated professionalism and fulfilled their
          assigned responsibilities as required by the organization.</p>

          <p>We sincerely appreciate the services and contributions of Mr./Ms. <strong>${escapeHTML(data.empName)}</strong>
          during their association with <strong>${COMPANY_NAME}</strong> and wish them continued success
          and growth in their future career.</p>

          <div class="sign-block">
            <p style="margin:0 0 2px;">Yours faithfully,</p>
            <p style="margin:0 0 8px;">For ${COMPANY_NAME}</p>
            <img src="signature.png" alt="Authorized signature and company stamp" class="stamp-img">
          </div>
        </div>

        <div class="letter-footer" style="border-top:1px solid #ccc;">
          <span style="color:#1155cc; font-weight:700; font-size:11px; letter-spacing:0.3px;">${COMPANY_NAME}</span>
        </div>
      </div>
    `;
  }

  generateBtn.addEventListener('click', function () {
    if (!form.reportValidity()) return;

    const data = {
      empName: empName.value.trim(),
      employeeId: employeeId.value.trim(),
      designation: designation.value.trim(),
      letterDateFormatted: formatDateDMY(letterDate.value),
      dojFormatted: formatDateDMY(doj.value),
      lwdFormatted: formatDateDMY(lastWorkingDate.value)
    };

    letterOutput.innerHTML = buildLetterHTML(data);
    letterOutput.classList.add('show');
    letterEmpty.style.display = 'none';

    previewStatus.textContent = 'Letter generated successfully.';
    previewStatus.style.color = '#2e7d32';

    generateBtn.textContent = 'Regenerate Experience Letter';
    editBtn.disabled = false;
    saveBtn.disabled = false;

    // Regenerating cancels any in-progress edit session.
    if (isEditing) toggleEditing(false);
    hasGenerated = true;
  });

  // ---------- Edit in place ----------
  // Useful for picking Mr./Ms. correctly (the template leaves both in
  // place, same as the source document) and for any manual touch-ups.
  function toggleEditing(forceState) {
    isEditing = typeof forceState === 'boolean' ? forceState : !isEditing;

    letterOutput.classList.toggle('editing', isEditing);
    editHint.classList.toggle('show', isEditing);

    const bodies = letterOutput.querySelectorAll('.page-body');
    bodies.forEach((el) => {
      el.setAttribute('contenteditable', isEditing ? 'true' : 'false');
    });

    editBtn.textContent = isEditing ? '\u2713 Done Editing' : '\u270E Edit Letter';
    editBtn.classList.toggle('active', isEditing);
  }

  editBtn.addEventListener('click', function () {
    if (!hasGenerated) return;
    toggleEditing();
  });

  // ---------- Download as PDF ----------
  printBtn.addEventListener('click', async function () {
    if (!hasGenerated) {
      previewStatus.textContent = 'Generate the letter first before downloading.';
      previewStatus.style.color = '#c62828';
      return;
    }
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF || typeof html2canvas !== 'function') {
      previewStatus.textContent = 'PDF export libraries failed to load.';
      previewStatus.style.color = '#c62828';
      return;
    }

    const pages = letterOutput.querySelectorAll('.page');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;

      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, Math.min(imgHeight, pageHeight));
    }

    const fileName = `Experience_Letter_${(empName.value.trim() || 'Employee').replace(/\s+/g, '_')}.pdf`;
    pdf.save(fileName);
  });

  // ---------- Save letter (download as standalone HTML) ----------
  saveBtn.addEventListener('click', function () {
    if (!hasGenerated) return;

    const docHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Experience Letter - ${escapeHTML(empName.value.trim())}</title>
<link rel="stylesheet" href="Experience.css">
</head>
<body>
${letterOutput.outerHTML}
</body>
</html>`;

    const blob = new Blob([docHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Experience_Letter_${(empName.value.trim() || 'Employee').replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
})();
