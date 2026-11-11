const MAX_CSV_BYTES = 500000;
const RECAPTCHA_ACTION = 'diary_submit';
const MIN_RECAPTCHA_SCORE = 0.5;

function doGet() {
  const properties = PropertiesService.getScriptProperties();
  const status = {
    status: 'ready',
    responseProtocol: 2,
    driveFolderConfigured: Boolean(properties.getProperty('DRIVE_FOLDER_ID')),
    recaptchaSecretConfigured: Boolean(properties.getProperty('RECAPTCHA_SECRET_KEY')),
    allowedHostnamesConfigured: Boolean(properties.getProperty('ALLOWED_HOSTNAMES'))
  };

  return ContentService.createTextOutput(JSON.stringify(status))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(event) {
  let requestId = '';
  let failureStage = 'request validation';

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

    failureStage = 'reCAPTCHA verification';
    verifyRecaptcha_(payload.captchaToken);

    failureStage = 'Google Drive configuration';
    const properties = PropertiesService.getScriptProperties();
    const folderId = properties.getProperty('DRIVE_FOLDER_ID');
    if (!folderId) throw new Error('DRIVE_FOLDER_ID is not configured');

    failureStage = 'saving the CSV to Google Drive';
    const filename = sanitizeFilename_(payload.filename);
    DriveApp.getFolderById(folderId).createFile(filename, csv, MimeType.CSV);

    return resultPage_(requestId, true, 'CSV saved.');
  } catch (error) {
    console.error('Google Drive CSV upload failed:', JSON.stringify({
      requestId,
      failureStage,
      error: String(error && error.message ? error.message : error)
    }));

    const message = failureStage === 'reCAPTCHA verification'
      ? String(error && error.message ? error.message : 'reCAPTCHA verification failed.')
      : failureStage === 'Google Drive configuration' || failureStage === 'saving the CSV to Google Drive'
        ? 'Upload failed while saving to Google Drive. Check the folder ID and the Apps Script deployment account permissions.'
        : 'Upload failed while validating the request. Please contact the study team.';
    return resultPage_(requestId, false, message);
  }
}

function verifyRecaptcha_(token) {
  if (!token) throw new Error('Missing reCAPTCHA token. Reload the diary and try again.');

  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty('RECAPTCHA_SECRET_KEY');
  const allowedHostnames = (properties.getProperty('ALLOWED_HOSTNAMES') || '')
    .split(',')
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
  if (!secret || allowedHostnames.length === 0) {
    throw new Error('reCAPTCHA is not configured. Set RECAPTCHA_SECRET_KEY and ALLOWED_HOSTNAMES in Apps Script properties.');
  }

  const response = UrlFetchApp.fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'post',
    payload: { secret, response: token },
    muteHttpExceptions: true
  });
  let result;
  try {
    result = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error('Google reCAPTCHA returned an invalid response. Check Apps Script execution logs and try again.');
  }

  const hostname = String(result.hostname || '').toLowerCase();
  const score = Number(result.score);

  if (!result.success) {
    const errorCodes = Array.isArray(result['error-codes']) ? result['error-codes'] : [];
    if (errorCodes.includes('invalid-input-secret') || errorCodes.includes('missing-input-secret')) {
      throw new Error('Google rejected the reCAPTCHA secret. Make sure RECAPTCHA_SECRET_KEY matches the site key configured in activities.json.');
    }
    if (errorCodes.includes('timeout-or-duplicate')) {
      throw new Error('The reCAPTCHA token expired or was already used. Reload the diary and submit again.');
    }
    if (errorCodes.includes('browser-error')) {
      throw new Error('Google reCAPTCHA reported a browser/network error. Retry in a standard browser and network with access to www.google.com and www.gstatic.com. If it continues, check the reCAPTCHA v3 site-key domain settings.');
    }
    throw new Error(`Google reCAPTCHA rejected the token${errorCodes.length ? ` (${errorCodes.join(', ')})` : ''}. Check that the reCAPTCHA site and secret keys are a matching pair.`);
  }

  if (!allowedHostnames.includes(hostname)) {
    throw new Error(`reCAPTCHA hostname "${hostname || 'unknown'}" is not in ALLOWED_HOSTNAMES. Add this exact hostname to Apps Script properties and the reCAPTCHA key's allowed domains.`);
  }
  if (result.action !== RECAPTCHA_ACTION) {
    throw new Error(`reCAPTCHA action "${result.action || 'missing'}" does not match "${RECAPTCHA_ACTION}". Check the site and secret key pair.`);
  }
  if (!Number.isFinite(score)) {
    throw new Error('Google reCAPTCHA did not return a valid score. Check that the configured key is a reCAPTCHA v3 key.');
  }
  if (score < MIN_RECAPTCHA_SCORE) {
    throw new Error(`reCAPTCHA score ${score} is below the required ${MIN_RECAPTCHA_SCORE}. Confirm the site key is configured for this domain and consider testing from the deployed site.`);
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
    `<!doctype html><script>
      const result = ${result};
      function notifyParent() {
        try { window.parent.postMessage(result, '*'); } catch (error) {}
        if (window.top !== window.parent) {
          try { window.top.postMessage(result, '*'); } catch (error) {}
        }
      }
      notifyParent();
      setTimeout(notifyParent, 250);
      setTimeout(notifyParent, 1000);
    </script>`
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}