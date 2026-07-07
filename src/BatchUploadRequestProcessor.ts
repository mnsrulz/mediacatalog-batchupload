import { AuthenticatedApiClient } from "./AuthenticatedApiClient";
import { RequestItemResponse, UploadProgress } from "./Models";
import { handleUploadProgress, handleError } from "./RemoteUploadApiMethods";
import { uploadAsync, uploadAsyncV2 } from "./UploadUtils";

export const processItem = async (queuedItem: RequestItemResponse) => {
    try {
        const progressReporter = (prog: UploadProgress) => {
            handleUploadProgress(queuedItem, prog);
        };

        if (!queuedItem.started) {    //only report start when it's not started
            await AuthenticatedApiClient.post(`remoteUrlUploadRequest/${queuedItem.id}/start`);
        }
        const result = await uploadAsyncV2(queuedItem, progressReporter);
        if (result) { //completed?
            await AuthenticatedApiClient.post(`remoteUrlUploadRequest/${queuedItem.id}/complete`);
        }
        return result;
    } catch (error) {
        console.error(error);
        handleError(queuedItem, error);
    }
}
