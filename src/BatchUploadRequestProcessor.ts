import { AuthenticatedApiClient } from "./AuthenticatedApiClient";
import { RequestItemResponse, UploadProgress } from "./Models";
import { handleUploadProgress, handleError } from "./RemoteUploadApiMethods";
import { uploadAsync } from "./UploadUtils";

export const processItem = async (queuedItem: RequestItemResponse) => {
    try {
        // const progressReporter = (prog: UploadProgress) => {
        //     handleUploadProgress(queuedItem, prog);
        // };
        await AuthenticatedApiClient.post(`remoteUrlUploadRequest/${queuedItem.id}/start`);
        const result = await uploadAsync(queuedItem);
        if (result) { //completed?
            await AuthenticatedApiClient.post(`remoteUrlUploadRequest/${queuedItem.id}/complete`);
        }
        return result;
    } catch (error) {
        console.error(error);
        handleError(queuedItem, error);
    }
}
