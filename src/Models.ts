
export interface RequestItemResponse {
    id: string,
    requestId: string,
    fileUrl: string,
    parentUrl: string,
    remoteUrl: string,
    rawUpload: boolean,
    fileName: string,
    fileUrlHeaders: Record<string, string>
}

export interface UploadProgress {
    percent: number;
    transferred: number;
    total?: number;
}