
export interface RequestItemResponse {
    id: string,
    requestId: string,
    fileUrl: string,
    parentUrl: string,
    remoteUrl: string
}

export interface UploadProgress {
    percent: number;
    transferred: number;
    total?: number;
}