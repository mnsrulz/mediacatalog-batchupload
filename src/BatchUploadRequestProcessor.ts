import { AuthenticatedApiClient } from "./AuthenticatedApiClient";
import { RequestItemResponse, UploadProgress } from "./Models";
import { handleUploadProgress, handleError } from "./RemoteUploadApiMethods";
import { uploadAsync } from "./UploadUtils";
import delay from 'delay';
import debug from 'debug';
const processingDelay = parseInt(process.env.PROCESS_BATCH_DELAY || '60000');   //in milli seconds

const logger = debug('BatchUploadRequestProcessor');
export class BatchUploadRequestProcessor {
    public async process() {
        while (true) {
            await processQueuedItems();
            logger('processing...');
            await delay(processingDelay);
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

    logger(`queued items found ${queuedItems.length}`);
    for (const queuedItem of queuedItems) {
        try {
            const progressReporter = (prog: UploadProgress) => {
                handleUploadProgress(queuedItem, prog);
            };
            await AuthenticatedApiClient.post(`remoteUrlUploadRequest/${queuedItem.id}/start`);
            await uploadAsync(queuedItem, progressReporter);
            await AuthenticatedApiClient.post(`remoteUrlUploadRequest/${queuedItem.id}/complete`);
        } catch (error) {
            logger(error);
            handleError(queuedItem, error);
        }
    }
}