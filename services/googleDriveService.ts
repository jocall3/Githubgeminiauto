import { DriveFile } from '../types';

// These are expected to be available in the environment.
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

declare const gapi: any;
declare const google: any;

let gapiInitialized = false;
let gisInitialized = false;
let tokenClient: any = null;
let googleAccessToken: any = null;

const initializeGapiClient = () => new Promise<void>((resolve, reject) => {
    if (gapiInitialized) {
        resolve();
        return;
    }
    if (typeof gapi === 'undefined') {
        return reject(new Error("gapi client not loaded."));
    }
    gapi.load('client:picker', () => {
        gapi.client.init({
            apiKey: GOOGLE_API_KEY,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        }).then(() => {
            gapiInitialized = true;
            resolve();
        }).catch(reject);
    });
});

const initializeGisClient = () => new Promise<void>((resolve, reject) => {
    if (gisInitialized) {
        resolve();
        return;
    }
    if (typeof google === 'undefined') {
        return reject(new Error("Google Identity Services not loaded."));
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse: any) => {
            googleAccessToken = tokenResponse;
            gisInitialized = true;
            resolve();
        },
        error_callback: (error: any) => {
            reject(new Error(`GSI Error: ${error.message}`));
        },
    });
    // Initial call to get token if needed
    if (!googleAccessToken) {
      // Prompt the user to select a Google Account and ask for consent to share their data
      // when establishing a new session.
      tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        gisInitialized = true;
        resolve();
    }
});


const createPicker = (token: any, callback: (data: any) => void) => {
    const view = new google.picker.View(google.picker.ViewId.DOCS);
    const picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.NAV_HIDDEN)
        .setAppId(GOOGLE_CLIENT_ID?.split('-')[0] || '')
        .setOAuthToken(token.access_token)
        .addView(view)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setCallback(callback)
        .build();
    picker.setVisible(true);
};

const downloadFile = async (fileId: string): Promise<string> => {
    const response = await gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media'
    });
    // Assuming text files for now. For binary files, this would need adjustment.
    return response.body;
};

export const pickAndDownloadFile = async (): Promise<DriveFile> => {
    if (!GOOGLE_API_KEY || !GOOGLE_CLIENT_ID) {
        throw new Error("Google API Key or Client ID is not configured.");
    }
    
    await initializeGapiClient();
    await initializeGisClient();

    if (!googleAccessToken) {
        throw new Error("Google authentication failed or was cancelled.");
    }

    return new Promise((resolve, reject) => {
        const pickerCallback = async (data: any) => {
            if (data[google.picker.Action.PICKED]) {
                const file = data[google.picker.Response.DOCUMENTS][0];
                const fileId = file[google.picker.Document.ID];
                const fileName = file[google.picker.Document.NAME];
                
                try {
                    const content = await downloadFile(fileId);
                    resolve({ name: fileName, content });
                } catch (error) {
                    reject(new Error(`Failed to download file from Drive: ${(error as Error).message}`));
                }
            } else if (data[google.picker.Action.CANCEL]) {
                reject(new Error("Google Picker was cancelled."));
            }
        };

        createPicker(googleAccessToken, pickerCallback);
    });
};
