import got from "got";
import { promisify } from 'util';
import { pipeline } from 'stream';
const pipelineAsync = promisify(pipeline);
import { UploadProgress } from "./Models";
import debug from 'debug';
const logger = debug('UploadUtils');

export const uploadAsync = async (fileUrl: string, remoteUrl: string, onProgress: (prog: UploadProgress) => any) => {
    logger('Initializing the upload...')
    const { headers } = await got.head(fileUrl);
    const contentLen = parseInt(headers['content-length'] || '');
    const uploadStream = got.stream.put(remoteUrl, {
        headers: {
            'Content-Range': `bytes 0-${contentLen - 1}/${contentLen}`,
            'Content-Length': `${contentLen}`
        }
    });
    const timer = setInterval(() => {
        logger('Progress: ', uploadStream.uploadProgress);
        onProgress(uploadStream.uploadProgress);
    }, 1000);
    try {
        await pipelineAsync(
            got.stream(fileUrl),
            uploadStream
        );
    } catch (error) {
        logger('error occurrerd during upload.', error);
        throw error;
    } finally {
        clearInterval(timer);
    }
    logger('Upload completed...');
}
