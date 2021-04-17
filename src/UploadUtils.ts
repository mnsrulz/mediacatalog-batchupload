import got from "got";
import { promisify } from 'util';
import { pipeline } from 'stream';
const pipelineAsync = promisify(pipeline);
import { UploadProgress } from "./Models";

export const uploadAsync = async (fileUrl: string, remoteUrl: string, onProgress: (prog: UploadProgress) => any) => {
    const { headers } = await got.head(fileUrl);
    const contentLen = parseInt(headers['content-length'] || '');
    const uploadStream = got.stream.put(remoteUrl, {
        headers: {
            'Content-Range': `bytes 0-${contentLen - 1}/${contentLen}`,
            'Content-Length': `${contentLen}`
        }
    });
    const timer = setInterval(() => {
        onProgress(uploadStream.uploadProgress);
    }, 1000);

    await pipelineAsync(
        got.stream(fileUrl),
        uploadStream
    );
    clearInterval(timer);
}
