const MAX_CSV_BYTES = 500000;
const RECAPTCHA_ACTION = 'diary_submit';
const MIN_RECAPTCHA_SCORE = 0.5;

function doGet() {
  const properties = PropertiesService.getScriptProperties();
  const status = {
    status: 'ready',
    driveFolderConfigured: Boolean(properties.getProperty('DRIVE_FOLDER_ID')),
    recaptchaSecretConfigured: Boolean(properties.getProperty('RECAPTCHA_SECRET_KEY')),
    allowedHostnamesConfigured: Boolean(properties.getProperty('ALLOWED_HOSTNAMES'))
  };

  return ContentService.createTextOutput(JSON.stringify(status))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(event) {
  let requestId = '';

  try {
    const payload = JSON.parse(event.parameter.payload || '{}');
    requestId = String(payload.requestId || '');
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) {
      throw new Error('Invalid request ID');
    }

    const csv = String(payload.csv || '');
    if (!csv || Utilities.newBlob(csv).getBytes().length > MAX_CSV_BYTES) {
      throw new Error('CSV is empty or exceeds the size limit');
    }

    verifyRecaptcha_(payload.captchaToken);

    const properties = PropertiesService.getScriptProperties();
    const folderId = properties.getProperty('DRIVE_FOLDER_ID');
    if (!folderId) throw new Error('DRIVE_FOLDER_ID is not configured');

    const filename = sanitizeFilename_(payload.filename);
    DriveApp.getFolderById(folderId).createFile(filename, csv, MimeType.CSV);

    return resultPage_(requestId, true, 'CSV saved.');
  } catch (error) {
    console.error('Google Drive CSV upload failed:', error);
    return resultPage_(requestId, false, 'Upload failed. Please try again or contact the study team.');
  }
}

function verifyRecaptcha_(token) {
  if (!token) throw new Error('Missing reCAPTCHA token');

  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty('RECAPTCHA_SECRET_KEY');
  const allowedHostnames = (properties.getProperty('ALLOWED_HOSTNAMES') || '')
    .split(',')
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
  if (!secret || allowedHostnames.length === 0) {
    throw new Error('reCAPTCHA script properties are not configured');
  }

  const response = UrlFetchApp.fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'post',
    payload: { secret, response: token },
    muteHttpExceptions: true
  });
  const result = JSON.parse(response.getContentText());
  const hostname = String(result.hostname || '').toLowerCase();
    const score = Number(result.score);

  if (!result.success
      || result.action !== RECAPTCHA_ACTION
      || !Number.isFinite(score)
      || score < MIN_RECAPTCHA_SCORE
      || !allowedHostnames.includes(hostname)) {
    throw new Error('reCAPTCHA verification failed');
  }
}

function sanitizeFilename_(filename) {
  const safeName = String(filename || 'timeline.csv')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return safeName.endsWith('.csv') ? safeName : `${safeName}.csv`;
}

function resultPage_(requestId, success, message) {
  const result = JSON.stringify({
    type: 'otud-google-drive-result',
    requestId,
    success,
    message
  }).replace(/</g, '\\u003c');

  return HtmlService.createHtmlOutput(
    `<!doctype html><script>window.parent.postMessage(${result}, '*');</script>`
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}