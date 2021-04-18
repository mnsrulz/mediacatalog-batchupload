import { AuthenticatedApiClient } from "./AuthenticatedApiClient";
import { RequestItemResponse, UploadProgress } from "./Models";
import { handleUploadProgress, handleError } from "./RemoteUploadApiMethods";
import { uploadAsync } from "./UploadUtils";
import delay from 'delay';
import debug from 'debug';
import PQueue from 'p-queue';
import AbortController from "abort-controller";

const processingDelay = parseInt(process.env.PROCESS_BATCH_DELAY || '300000');   //in milli seconds
const maxQueueConcurrency = parseInt(process.env.CONCURRENCY_MAX || '2');   //in milli seconds

const queue = new PQueue({ concurrency: maxQueueConcurrency });

const logger = debug('BatchUploadRequestProcessor');
let abortController: AbortController = new AbortController();
export const startProcessing = async () => {
    while (true) {
        logger('processing...');
        await processQueuedItems();
        await delay(processingDelay, { signal: abortController.signal }).catch(() => { logger('signal must have aborted this') });
        abortController = new AbortController();
    }
}

export const signal = () => abortController.abort();

const processQueuedItems = async () => {
    const queuedItems = await AuthenticatedApiClient<RequestItemResponse[]>('remoteUrlUploadRequest', {
        searchParams: {
            status: 'queued'
        },
        resolveBodyOnly: true
    });

    logger(`queued items found ${queuedItems.length}`);
    for (const queuedItem of queuedItems.reverse()) {   //reverse the list as old items should process first
        logger('checking if queue can handle this...');
        await queue.onEmpty();
        logger('checking is ready to handle this... queueing up!!!');
        queue.add(() => processItem(queuedItem));
    }
}

async function processItem(queuedItem: RequestItemResponse) {
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
