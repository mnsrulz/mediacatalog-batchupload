import { AuthenticatedApiClient } from "./AuthenticatedApiClient";
import { RequestItemResponse, UploadProgress } from "./Models";
import debug from 'debug';
const logger = debug('RemoteUploadApiMethods');

export const handleError = (queuedItem: RequestItemResponse, error: any) => {
    AuthenticatedApiClient.post(`remoteUrlUploadRequest/${queuedItem.id}/error`, {
        json: {
            message: JSON.stringify(error)
        }
    }).catch(() => {
        logger.log('error occurred while publishing the error.');
    });
}

export const handleUploadProgress = (queuedItem: RequestItemResponse, progress: UploadProgress) => {
    AuthenticatedApiClient.post(`remoteUrlUploadRequest/${queuedItem.id}/progress`, {
        json: {
            size: progress.total,
            uploaded: progress.transferred
        }
    }).catch(() => {
        logger.log('error occurred while publishing the progress..');
    });
}