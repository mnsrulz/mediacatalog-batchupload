import { AuthenticatedApiClient } from "./AuthenticatedApiClient";
import { RequestItemResponse, UploadProgress } from "./Models";
import { handleUploadProgress, handleError } from "./RemoteUploadApiMethods";
import { uploadAsync } from "./UploadUtils";

export const processItem = async (queuedItem: RequestItemResponse) => {
    try {
        const progressReporter = (prog: UploadProgress) => {
            handleUploadProgress(queuedItem, prog);
        };

        if (!queuedItem.started) {    //only report start when it's not started
            await AuthenticatedApiClient.post(`remoteUrlUploadRequest/${queuedItem.id}/start`);
            queuedItem.started = true;
        }
        await uploadAsync(queuedItem, progressReporter);
        await AuthenticatedApiClient.post(`remoteUrlUploadRequest/${queuedItem.id}/complete`);
    } catch (error) {
        console.error(error);
        handleError(queuedItem, error);
        throw error;    //rethrow
    }
}
