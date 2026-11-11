# Anonymous Google Drive Upload

O-TUD can upload each completed diary as a CSV into a folder in the study owner's personal Google Drive. Participants do not need Google accounts or sign in. The upload runs through a Google Apps Script deployed under the owner's account and uses reCAPTCHA v3 to reduce automated abuse.

## 1. Create a Drive Folder

Create a folder in the Google account that will own the submissions. Copy the folder ID from its URL:

```text
https://drive.google.com/drive/folders/FOLDER_ID
```

Keep the folder private. The Apps Script will be the only uploader.

## 2. Create reCAPTCHA v3 Keys

Create a reCAPTCHA v3 key pair and add the exact hostnames where O-TUD will run, such as `yourname.github.io` and `localhost` for local testing. The site key is public; the secret key must only be stored in Apps Script properties.

## 3. Create the Apps Script

1. While signed in to the Google account that owns the folder, create a project at [script.google.com](https://script.google.com).
2. Replace the starter code with the contents of `google-drive/Code.gs` from this repository.
3. Open **Project Settings** and add these Script Properties:

| Property | Value |
| --- | --- |
| `DRIVE_FOLDER_ID` | The folder ID from step 1 |
| `RECAPTCHA_SECRET_KEY` | The reCAPTCHA secret key |
| `ALLOWED_HOSTNAMES` | Comma-separated allowed hostnames, such as `yourname.github.io,localhost` |

4. Choose **Deploy > New deployment > Web app**.
5. Set **Execute as** to your account and **Who has access** to **Anyone** so participants do not need to sign in.
6. Deploy and copy the web app URL ending in `/exec`.

Google may restrict anonymous web app deployments for some accounts. If **Anyone** is unavailable, ask Google Workspace support or use an approved backend that supports anonymous participants.

## 4. Configure O-TUD

In `settings/activities.json`, set the two public values under `general.googleDrive`:

```json
"googleDrive": {
  "appsScriptUrl": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
  "recaptchaSiteKey": "YOUR_RECAPTCHA_SITE_KEY"
}
```

The reCAPTCHA badge is displayed by Google. Do not remove it or put the secret key or Drive credentials in this repository.

## 5. Test the Upload

After deploying the current script version, open the `/exec` URL in a browser. It should return a JSON status with `"status":"ready"`, `"responseProtocol":2`, and all three `...Configured` values set to `true`. If it asks you to sign in or shows an access error, update the web app deployment so it executes as you and is available to anyone, then deploy a new version.

Run the app on an allowed hostname, complete a test diary, and submit it. Confirm that a uniquely named `timeline_...csv` appears in the configured folder. Check **Apps Script > Executions** if an upload fails. Test with non-sensitive data before collecting study responses.

The endpoint accepts CSV files up to 500 KB and checks the reCAPTCHA action, score, and hostname before writing to the configured folder. Anonymous endpoints can still receive unwanted traffic; reCAPTCHA is abuse mitigation, not authentication. Follow your study's consent, privacy, and data-retention requirements.

The upload error shown to participants identifies whether validation, reCAPTCHA verification, or Google Drive configuration/saving failed. reCAPTCHA errors distinguish a rejected key pair, hostname/action mismatch, expired token, low score, or browser/network error. For a browser/network error, test in a standard browser/network and make sure `www.google.com` and `www.gstatic.com` are reachable; also verify the reCAPTCHA v3 key allows the app's hostname. A Drive error usually indicates an incorrect folder ID or missing access for the account that owns the Apps Script deployment. After changing `Code.gs`, deploy a new web app version for the updated error message to take effect.