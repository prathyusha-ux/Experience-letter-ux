function getElement(id) {
  return document.getElementById(id);
}

/* ----------------------------------------------------------------------- *
 * COMPANY CONSTANTS
 * ----------------------------------------------------------------------- */
const COMPANY = {
  name: 'UXINTERFACELY IT SOLUTIONS LLP',
  logoImage: 'logo.png',
  stampImage: 'signature.png',
};

/* ----------------------------------------------------------------------- *
 * BACKEND CONFIG
 * ----------------------------------------------------------------------- */
// TODO: replace with your actual deployed Render service URL.
const RENDER_API_BASE = 'https://experience-letter-ux.onrender.com';
// TODO: must exactly match SERVER_API_KEY set in Render for this service.
const RENDER_API_KEY = 'uxinterfacely experienceletter 01';

// TODO: fill in your Supabase project's URL and public anon key
// (Project Settings -> API). Safe to expose client-side as long as RLS
// is enabled with a SELECT policy for the anon role on the employees table.
const SUPABASE_URL = 'https://gmsmuymadicqrncropih.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_D6k8uJiLHAVaACraUMI6xw_93XiEfpS';

// Relieving letter table — employee_id and confirmed last working date
// are recorded here at exit stage, keyed by employee name.
const RELIEVING_LETTERS_TABLE = 'relieving_letters';
const COL_RELIEVING_NAME = 'employee_name';
const COL_RELIEVING_EMPLOYEE_ID = 'employee_id';
const COL_RELIEVING_LWD = 'last_working_date';

// Offer letter table — proposed designation/DOJ/recipient email were
// recorded here at offer stage, keyed by candidate name (not employee_id,
// since that doesn't exist yet at offer stage).
const OFFER_LETTERS_TABLE = 'offer_sends';
const COL_CANDIDATE_NAME = 'candidate_name';
const COL_JOB_TITLE = 'job_title';
const COL_OFFER_DOJ = 'date_of_joining';
const COL_RECIPIENT_EMAIL = 'recipient_email';

/* ----------------------------------------------------------------------- *
 * FORMATTING HELPERS
 * ----------------------------------------------------------------------- */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

/** "18/09/2026" — matches the source template's [DD/MM/YYYY] style */
function formatDateDMY(isoDateString) {
  if (!isoDateString) return '';
  const date = new Date(isoDateString + 'T00:00:00');
  if (isNaN(date.getTime())) return isoDateString;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function toLocalISO(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const todayISO = toLocalISO(new Date());

/* ----------------------------------------------------------------------- *
 * DEFENSIVE SETUP WRAPPER
 * ----------------------------------------------------------------------- */
function safeSetup(label, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`Setup step "${label}" failed — this element/feature may not work:`, err);
  }
}

safeSetup('default letterDate', () => {
  getElement('letterDate').value = todayISO;
});

/* ----------------------------------------------------------------------- *
 * SUPABASE — HRMS lookup (shared employees database)
 * ----------------------------------------------------------------------- */
let supabaseClient = null;
safeSetup('Supabase client init', () => {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.warn('Supabase client library not found — check the CDN <script> tag is included before script.js. HRMS lookup will be unavailable, but the rest of the tool still works.');
  }
});

function setHint(el, text, isMissing, color) {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('missing', !!isMissing);
  el.style.color = color || '';
}

/**
 * Looks up two separate tables by the employee's full name:
 *  - offer_letters: designation, proposed DOJ, recipient email (recorded at offer stage)
 *  - employees: employee_id, confirmed last working date (recorded once actually joined)
 * Either lookup succeeding independently still fills in what it found.
 */
async function fetchHrmsRecordsByName(name) {
  const [offerResult, relievingResult] = await Promise.all([
    supabaseClient
      .from(OFFER_LETTERS_TABLE)
      .select(`${COL_JOB_TITLE}, ${COL_OFFER_DOJ}, ${COL_RECIPIENT_EMAIL}`)
      .ilike(COL_CANDIDATE_NAME, name)
      .maybeSingle(),
    supabaseClient
      .from(RELIEVING_LETTERS_TABLE)
      .select(`${COL_RELIEVING_EMPLOYEE_ID}, ${COL_RELIEVING_LWD}`)
      .ilike(COL_RELIEVING_NAME, name)
      .maybeSingle(),
  ]);

  if (offerResult.error) console.error('offer_letters lookup failed:', offerResult.error);
  if (relievingResult.error) console.error('relieving_letters lookup failed:', relievingResult.error);

  return { offer: offerResult.data || null, relieving: relievingResult.data || null };
}

async function handleLookupClick() {
  const dojHint = getElement('dojHint');
  const lwdHint = getElement('lwdHint');
  const name = getElement('empName').value.trim();

  if (!name) {
    alert('Enter the employee\'s Full Name first, then click "Fetch Dates from HRMS".');
    getElement('empName').focus();
    return;
  }
  if (!supabaseClient) {
    setHint(dojHint, 'Database not connected — enter details manually', true);
    setHint(lwdHint, 'Database not connected — enter details manually', true);
    return;
  }

  const lookupBtn = getElement('lookupBtn');
  lookupBtn.disabled = true;
  lookupBtn.textContent = 'Looking up…';

  try {
    const { offer, relieving } = await fetchHrmsRecordsByName(name);

    if (!offer && !relieving) {
      setHint(dojHint, 'No matching records found for this name', true);
      setHint(lwdHint, 'No matching records found for this name', true);
      return;
    }

    if (offer) {
      getElement('designation').value = offer[COL_JOB_TITLE] || '';
      getElement('doj').value = offer[COL_OFFER_DOJ] || '';
      getElement('emailInput').value = offer[COL_RECIPIENT_EMAIL] || '';
      setHint(dojHint, 'Pulled from offer letter records', false);
    } else {
      setHint(dojHint, 'No offer letter record found for this name', true);
    }

    if (relieving) {
      getElement('employeeId').value = relieving[COL_RELIEVING_EMPLOYEE_ID] || '';
      getElement('lastWorkingDate').value = relieving[COL_RELIEVING_LWD] || '';
      setHint(lwdHint, 'Pulled from relieving letter records', false);
    } else {
      setHint(lwdHint, 'No relieving letter record found for this name', true);
    }
  } catch (err) {
    console.error('HRMS lookup failed:', err);
    setHint(dojHint, 'Lookup failed — check console for details', true);
    setHint(lwdHint, 'Lookup failed — check console for details', true);
  } finally {
    lookupBtn.disabled = false;
    lookupBtn.textContent = 'Fetch Dates from HRMS';
  }
}

safeSetup('lookupBtn click listener', () => {
  getElement('lookupBtn').addEventListener('click', handleLookupClick);
});
safeSetup('manual date entry hints', () => {
  getElement('doj').addEventListener('input', () => setHint(getElement('dojHint'), 'Entered manually', false, '#666666'));
  getElement('lastWorkingDate').addEventListener('input', () => setHint(getElement('lwdHint'), 'Entered manually', false, '#666666'));
});

/* ----------------------------------------------------------------------- *
 * FORM WIRING
 * ----------------------------------------------------------------------- */
function readFormValues() {
  return {
    name: getElement('empName').value.trim(),
    employeeId: getElement('employeeId').value.trim(),
    designation: getElement('designation').value.trim(),
    letterDate: getElement('letterDate').value,
    doj: getElement('doj').value,
    lastWorkingDate: getElement('lastWorkingDate').value,
  };
}

function formValuesAreValid(values) {
  if (!values.name || !values.employeeId || !values.designation || !values.letterDate || !values.doj || !values.lastWorkingDate) {
    alert('Please fill in Name, Employee ID, Designation, Letter Date, Date of Joining, and Last Working Date.');
    return false;
  }
  return true;
}

const REQUIRED_FIELD_IDS = ['empName', 'employeeId', 'designation', 'letterDate', 'doj', 'lastWorkingDate'];

function checkRequiredFieldsInSequence() {
  for (let i = 0; i < REQUIRED_FIELD_IDS.length; i++) {
    const el = getElement(REQUIRED_FIELD_IDS[i]);
    if (!el) continue;
    if (!el.value || !el.value.trim()) {
      el.setCustomValidity('Please fill this field');
      el.reportValidity();
      el.focus();
      return false;
    }
    if (!el.validity.valid) {
      el.reportValidity();
      el.focus();
      return false;
    }
    if (el.validationMessage === '') {
      el.setCustomValidity('');
    }
  }
  return true;
}

safeSetup('fill-first validation on blur', () => {
  REQUIRED_FIELD_IDS.forEach((id) => {
    const el = getElement(id);
    if (!el) return;
    el.addEventListener('blur', () => {
      if (!el.value || !el.value.trim()) {
        el.setCustomValidity('Please fill this first');
        el.reportValidity();
      } else {
        el.setCustomValidity('');
      }
    });
    el.addEventListener('input', () => el.setCustomValidity(''));
  });
});

safeSetup('input character restrictions', () => {
  function restrictToAlphabets(elementId) {
    const el = getElement(elementId);
    if (!el) return;
    el.addEventListener('input', () => {
      el.value = el.value.replace(/[^A-Za-z\s]/g, '');
    });
  }
  restrictToAlphabets('empName');
});

safeSetup('block only-numbers or only-special-characters in Designation', () => {
  const DISCLAIMER = 'This field cannot contain only numbers or only special characters — please enter a valid value.';

  function isOnlyNumbersOrOnlySpecialChars(value) {
    const trimmed = value.trim();
    if (!trimmed) return false;
    const onlyNumbers = /^[0-9]+$/.test(trimmed);
    const onlySpecialChars = /^[^A-Za-z0-9]+$/.test(trimmed);
    return onlyNumbers || onlySpecialChars;
  }

  const el = getElement('designation');
  if (!el) return;

  const validate = () => {
    if (isOnlyNumbersOrOnlySpecialChars(el.value)) {
      el.setCustomValidity(DISCLAIMER);
      el.reportValidity();
    } else {
      el.setCustomValidity('');
    }
  };

  el.addEventListener('input', validate);
  el.addEventListener('blur', validate);
});

/* ----------------------------------------------------------------------- *
 * LETTER BUILDER — matches the UXINTERFACELY Experience Letter template
 * ----------------------------------------------------------------------- */
function buildLetterHtml(values) {
  return `
    <div class="page">
      <div class="letterhead">
        <img class="logo-img" src="${COMPANY.logoImage}" alt="Logo">
      </div>

      <div class="letter-title" style="color:#000; text-decoration:underline;">Experience Letter</div>

      <div class="page-body">
        <p style="margin:0 0 2px;"><strong>Date:</strong> ${formatDateDMY(values.letterDate)}</p>
        <p style="margin:0 0 14px;"><strong>Employee ID.:</strong> ${escapeHTML(values.employeeId)}</p>

        <p>This is to certify that <strong>Mr./Ms. ${escapeHTML(values.name)}</strong> was employed
        with <strong>${COMPANY.name}</strong> as <strong>${escapeHTML(values.designation)}</strong>
        from <strong>${formatDateDMY(values.doj)}</strong> to <strong>${formatDateDMY(values.lastWorkingDate)}</strong>.</p>

        <p>During the period of employment, the employee was associated with the organization in a
        professional capacity and was responsible for carrying out the duties and responsibilities
        assigned to them in accordance with the requirements of their role. The employee contributed
        to various organizational activities and project-related assignments during their tenure.
        Throughout their employment, the employee demonstrated professionalism and fulfilled their
        assigned responsibilities as required by the organization.</p>

        <p>We sincerely appreciate the services and contributions of <strong>Mr./Ms. ${escapeHTML(values.name)}</strong>
        during their association with <strong>${COMPANY.name}</strong> and wish them continued success
        and growth in their future career.</p>

        <div class="sign-block">
          <p style="margin:0 0 2px;"><strong>Yours faithfully,</strong></p>
          <p style="margin:0 0 8px;"><strong>For ${COMPANY.name}</strong></p>
          <img src="${COMPANY.stampImage}" alt="Authorized signature and company stamp" class="stamp-img">
        </div>
      </div>

      <div class="letter-footer" style="border-top:1px solid #ccc;">
        <span style="color:#1155cc; font-weight:700; font-size:11px; letter-spacing:0.3px;">${COMPANY.name}</span>
      </div>
    </div>
  `;
}

/* ----------------------------------------------------------------------- *
 * GENERATE / DISPLAY
 * ----------------------------------------------------------------------- */
function exitEditMode() {
  getElement('letterOutput').classList.remove('editing');
  getElement('editHint').classList.remove('show');
  const editBtn = getElement('editBtn');
  editBtn.classList.remove('active');
  editBtn.innerHTML = '&#9998; Edit Letter';
  document.querySelectorAll('#letterOutput .page-body').forEach((el) => {
    el.setAttribute('contenteditable', 'false');
  });
}

function displayLetter(letterHtml) {
  getElement('letterOutput').innerHTML = letterHtml;
  getElement('letterOutput').classList.add('show');
  getElement('letterEmpty').style.display = 'none';
  getElement('previewStatus').textContent = 'Generated ✓';
  exitEditMode();
  getElement('editBtn').disabled = false;
  getElement('emailBtn').disabled = false;
  getElement('saveBtn').disabled = false;
}

function handleGenerateClick() {
  if (!checkRequiredFieldsInSequence()) return;
  const values = readFormValues();
  if (!formValuesAreValid(values)) return;
  displayLetter(buildLetterHtml(values));
}

/* ----------------------------------------------------------------------- *
 * PDF EXPORT — sharp JPEG-based render, sized to content (not fixed A4)
 * ----------------------------------------------------------------------- */
const PX_TO_MM = 25.4 / 96;
const RENDER_SCALE = 2;
const JPEG_QUALITY = 0.92;

async function buildLetterPdf() {
  if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    throw new Error('The PDF library failed to load — check your internet connection and reload the page.');
  }
  const pageEls = Array.from(document.querySelectorAll('#letterOutput .page'));
  if (pageEls.length === 0) {
    throw new Error('Nothing to export — generate the letter first.');
  }
  // Make sure the Calibri/Carlito webfont has actually finished loading
  // before html2canvas takes its snapshot.
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const { jsPDF } = window.jspdf;
  let pdf = null;

  for (let i = 0; i < pageEls.length; i++) {
    const canvas = await html2canvas(pageEls[i], {
      scale: RENDER_SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: -window.scrollY,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
    });

    const widthMm = (canvas.width / RENDER_SCALE) * PX_TO_MM;
    const heightMm = (canvas.height / RENDER_SCALE) * PX_TO_MM;
    const imgData = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

    if (!pdf) {
      pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [widthMm, heightMm] });
    } else {
      pdf.addPage([widthMm, heightMm], 'portrait');
    }
    pdf.addImage(imgData, 'JPEG', 0, 0, widthMm, heightMm);
  }

  return pdf;
}

async function handlePrintClick() {
  if (!getElement('letterOutput').classList.contains('show')) {
    alert('Generate the experience letter first.');
    return;
  }

  const printBtn = getElement('printBtn');
  printBtn.disabled = true;
  printBtn.textContent = 'Preparing PDF...';

  try {
    const pdf = await buildLetterPdf();
    const nameForFile = (getElement('empName').value.trim() || 'Experience_Letter').replace(/\s+/g, '_');
    pdf.save(`${nameForFile}_Experience_Letter.pdf`);
  } catch (err) {
    console.error('PDF generation failed:', err);
    alert('Something went wrong generating the PDF.\n\nDetails: ' + (err && err.message ? err.message : err));
  } finally {
    printBtn.disabled = false;
    printBtn.textContent = 'Download as PDF';
  }
}

/* ----------------------------------------------------------------------- *
 * EDIT LETTER
 * ----------------------------------------------------------------------- */
function handleEditClick() {
  if (!getElement('letterOutput').classList.contains('show')) {
    alert('Generate the experience letter first.');
    return;
  }

  const output = getElement('letterOutput');
  const editBtn = getElement('editBtn');
  const nowEditing = !output.classList.contains('editing');

  output.classList.toggle('editing', nowEditing);
  getElement('editHint').classList.toggle('show', nowEditing);
  document.querySelectorAll('#letterOutput .page-body').forEach((el) => {
    el.setAttribute('contenteditable', nowEditing ? 'true' : 'false');
  });

  editBtn.classList.toggle('active', nowEditing);
  editBtn.innerHTML = nowEditing ? '&#10003; Done Editing' : '&#9998; Edit Letter';
}

/* ----------------------------------------------------------------------- *
 * EMAIL LETTER — real send via the experience-letter Render backend
 * ----------------------------------------------------------------------- */
async function handleEmailClick() {
  if (!getElement('letterOutput').classList.contains('show')) {
    alert('Generate the experience letter first.');
    return;
  }
  const emailInput = getElement('emailInput');
  const recipient = emailInput.value.trim();
  if (!recipient || !emailInput.checkValidity()) {
    alert('Enter a valid recipient email address.');
    emailInput.focus();
    return;
  }

  const name = getElement('empName').value.trim() || 'Employee';
  const employeeId = getElement('employeeId').value.trim();
  const designation = getElement('designation').value.trim() || 'their role';
  const dojIso = getElement('doj').value;
  const lwdIso = getElement('lastWorkingDate').value;

  const emailBtn = getElement('emailBtn');
  emailBtn.disabled = true;
  const originalLabel = emailBtn.innerHTML;
  emailBtn.innerHTML = 'Sending...';

  try {
    const pdf = await buildLetterPdf();
    const pdfBlob = pdf.output('blob');

    const formData = new FormData();
    formData.append('recipient', recipient);
    formData.append('employeeName', name);
    formData.append('employeeId', employeeId);
    formData.append('designation', designation);
    formData.append('doj', dojIso);
    formData.append('dojDisplay', formatDateDMY(dojIso));
    formData.append('lastWorkingDate', lwdIso);
    formData.append('lwdDisplay', formatDateDMY(lwdIso));
    formData.append('pdf', pdfBlob, `${name.replace(/\s+/g, '_')}_Experience_Letter.pdf`);

    const response = await fetch(`${RENDER_API_BASE}/api/send-experience`, {
      method: 'POST',
      headers: { 'x-api-key': RENDER_API_KEY },
      body: formData,
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to send email');
    }

    alert(`Experience letter sent to ${recipient}.`);
  } catch (err) {
    console.error('Email send failed:', err);
    alert('Could not send the email.\n\nDetails: ' + (err && err.message ? err.message : err));
  } finally {
    emailBtn.disabled = false;
    emailBtn.innerHTML = originalLabel;
  }
}

/* ----------------------------------------------------------------------- *
 * SAVE LETTER — uploads PDF + logs the record via the Render backend
 * ----------------------------------------------------------------------- */
async function handleSaveClick() {
  if (!getElement('letterOutput').classList.contains('show')) {
    alert('Generate the experience letter first.');
    return;
  }

  const name = getElement('empName').value.trim() || 'Employee';
  const employeeId = getElement('employeeId').value.trim();
  const designation = getElement('designation').value.trim() || 'their role';
  const recipientEmail = getElement('emailInput').value.trim();
  const dojIso = getElement('doj').value;
  const lwdIso = getElement('lastWorkingDate').value;

  const saveBtn = getElement('saveBtn');
  saveBtn.disabled = true;
  const originalLabel = saveBtn.innerHTML;
  saveBtn.innerHTML = 'Saving...';

  try {
    const pdf = await buildLetterPdf();
    const pdfBlob = pdf.output('blob');

    const formData = new FormData();
    formData.append('employeeName', name);
    formData.append('employeeId', employeeId);
    formData.append('designation', designation);
    if (recipientEmail) formData.append('recipientEmail', recipientEmail);
    if (dojIso) formData.append('doj', dojIso);
    if (lwdIso) formData.append('lastWorkingDate', lwdIso);
    formData.append('pdf', pdfBlob, `${name.replace(/\s+/g, '_')}_Experience_Letter.pdf`);

    const response = await fetch(`${RENDER_API_BASE}/api/save-experience`, {
      method: 'POST',
      headers: { 'x-api-key': RENDER_API_KEY },
      body: formData,
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to save experience letter');
    }

    alert(`Experience letter saved for ${name}.`);
  } catch (err) {
    console.error('Save failed:', err);
    alert('Could not save the experience letter.\n\nDetails: ' + (err && err.message ? err.message : err));
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalLabel;
  }
}

/* ----------------------------------------------------------------------- *
 * WIRE UP BUTTONS
 * ----------------------------------------------------------------------- */
safeSetup('generateBtn click listener', () => {
  getElement('generateBtn').addEventListener('click', handleGenerateClick);
});
safeSetup('printBtn click listener', () => {
  getElement('printBtn').addEventListener('click', handlePrintClick);
});
safeSetup('editBtn click listener', () => {
  getElement('editBtn').addEventListener('click', handleEditClick);
});
safeSetup('emailBtn click listener', () => {
  getElement('emailBtn').addEventListener('click', handleEmailClick);
});
safeSetup('saveBtn click listener', () => {
  getElement('saveBtn').addEventListener('click', handleSaveClick);
});
