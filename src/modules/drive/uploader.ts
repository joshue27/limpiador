import { google } from 'googleapis';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

export async function uploadToDrive(
  credentials: { clientId: string; clientSecret: string; refreshToken: string; folderId: string },
  filePath: string,
  fileName: string,
  folderNames: string[],
) {
  const auth = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret);
  auth.setCredentials({ refresh_token: credentials.refreshToken });

  const drive = google.drive({ version: 'v3', auth });

  let folderId = credentials.folderId;

  for (const folderName of folderNames) {
    const existing = await drive.files.list({
      q: `name='${escapeDriveQueryValue(folderName)}' and mimeType='application/vnd.google-apps.folder' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)',
    });

    if (existing.data.files && existing.data.files.length > 0) {
      folderId = existing.data.files[0].id!;
      continue;
    }

    const folder = await drive.files.create({
      requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [folderId] },
      fields: 'id',
    });
    folderId = folder.data.id!;
  }

  const fileSize = (await stat(filePath)).size;
  const media = { body: createReadStream(filePath) };

  await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media,
    fields: 'id',
  });

  return { folderId, fileName, size: fileSize };
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/'/g, "\\'");
}
