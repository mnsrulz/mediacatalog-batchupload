import { AuthenticatedApiClient } from "./AuthenticatedApiClient";
import { RequestItemResponse, UploadProgress } from "./Models";
import { handleUploadProgress, handleError } from "./RemoteUploadApiMethods";
import { uploadAsync } from "./UploadUtils";
import debug from 'debug';

const logger = debug('BatchUploadRequestProcessor');

export const processItem = async (queuedItem: RequestItemResponse) => {
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
