import { AuthenticatedApiClient } from "./AuthenticatedApiClient";
import { RequestItemResponse, UploadProgress } from "./Models";
import { handleUploadProgress, handleError } from "./RemoteUploadApiMethods";
import { uploadAsync } from "./UploadUtils";
import delay from 'delay';
import debug from 'debug';

export class BatchUploadRequestProcessor {
    public async process() {
        while (true) {
            console.log('processing starting...')
            debug('processing...');
            await delay(5000);
            await processQueuedItems();
        }
    }
}

const processQueuedItems = async () => {
    const queuedItems = await AuthenticatedApiClient<RequestItemResponse[]>('remoteUrlUploadRequest', {
        searchParams: {
            status: 'queued'
        },
        resolveBodyOnly: true
    });

    for (const queuedItem of queuedItems) {
        try {
            const progressReporter = (prog: UploadProgress) => { handleUploadProgress(queuedItem, prog); };
            await AuthenticatedApiClient.post(`remoteUrlUploadRequest/${queuedItem.id}/start`);
            await uploadAsync(queuedItem.fileUrl, queuedItem.remoteUrl, progressReporter);
            await AuthenticatedApiClient.post(`remoteUrlUploadRequest/${queuedItem.id}/complete`);
        } catch (error) {
            handleError(queuedItem, error);
        }
    }
}