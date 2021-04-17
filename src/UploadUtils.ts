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
    let _resolve: any;
    let _reject: any;
    const promise = new Promise((res, rej) => {
        _resolve = res;
        _reject = rej;
    });
    const uploadStream = got.stream.put(remoteUrl, {
        headers: {
            'Content-Range': `bytes 0-${contentLen - 1}/${contentLen}`,
            'Content-Length': `${contentLen}`
        }
    }).on('end', () => {
        _resolve('upload end event detected.');
    }).on('error', (err) => {
        _reject(`error found in the response of stream upload. ${err.message}`);
    });
    const timer = setInterval(() => {
        const { total, transferred, percent } = uploadStream.uploadProgress;
        logger(`Progress: ### ${percent}% ### ${transferred}/${total}`);
        onProgress(uploadStream.uploadProgress);
    }, 1000);
    try {
        await pipelineAsync(
            got.stream(fileUrl),
            uploadStream
        );
        await promise;
    } catch (error) {
        logger('error occurrerd during upload.', error);
        throw error;
    } finally {
        clearInterval(timer);
    }
    logger('Upload completed...');
}
