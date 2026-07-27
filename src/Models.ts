
export interface RequestItemResponse {
    id: string,
    requestId: string,
    fileUrl: string,
    fileSize: number,
    parentUrl: string,
    remoteUrl: string,
    rawUpload: boolean,
    fileName: string,
    fileUrlHeaders?: Record<string, string>,
    started: boolean
}

export interface UploadProgress {
    percent: number;
    transferred: number;
    total?: number;
}