import got from "got";
import { promisify } from 'util';
import { pipeline } from 'stream';
import { RequestItemResponse, UploadProgress } from "./Models";
import debug from 'debug';
import { Open } from 'unzipper';
import { basename } from "path";
const request = require("request");
const logger = debug('UploadUtils');
const pipelineAsync = promisify(pipeline);

export const uploadAsync = async (queuedItem: RequestItemResponse, onProgress: (prog: UploadProgress) => any) => {
    const { fileUrl, fileName, rawUpload, remoteUrl } = queuedItem;
    logger('Initializing the upload...')

    let resumeFromPosition = 0;
    if (rawUpload) {
        const byteRange = await fetchStatusOfRemoteUpload(remoteUrl);
        resumeFromPosition = byteRange?.rangeEnd || 0;
    }

    const { inputStream, size } = rawUpload ? await fetchRawStream(fileUrl, resumeFromPosition) : await fetchZipStream(fileUrl, fileName)
    const { uploadStream, promise } = prepareUploadStream(remoteUrl, resumeFromPosition, size);

    const timer = setInterval(() => {
        const { total, transferred, percent } = uploadStream.uploadProgress;
        logger(`Progress: ### ${percent}% ### ${transferred}/${total}`);
        onProgress(uploadStream.uploadProgress);
    }, 1000);
    try {
        await pipelineAsync(
            inputStream,
            uploadStream
        );
        logger('pipeline async completed!');
        await promise;
    } catch (error) {
        logger('error occurrerd during upload.', error);
        throw error;
    } finally {
        clearInterval(timer);
    }
    logger('Upload completed...');
}

const prepareUploadStream = (remoteUrl: string, start: number, contentLen: number) => {
    let _resolve: any;
    let _reject: any;
    const promise = new Promise((res, rej) => {
        _resolve = res;
        _reject = rej;
    });

    const uploadStream = got.stream.put(remoteUrl, {
        headers: {
            'Content-Range': `bytes ${start}-${contentLen - 1}/${contentLen}`,
            'Content-Length': `${contentLen}`
        }
    }).on('data', () => {
        logger('data event detected.')
        _resolve('data event detected.');
    }).on('end', () => {
        logger('upload end event detected.')
        _resolve('upload end event detected.');
    }).on('error', (err) => {
        logger('error found in the response of stream upload.')
        _reject(`error found in the response of stream upload. ${err.message}`);
    });
    return {
        promise,
        uploadStream
    }
}

const fetchRawStream = async (fileUrl: string, startPosition: number) => {
    const { headers } = await got.head(fileUrl);
    const contentLen = parseInt(headers['content-length'] || '');
    return {
        size: contentLen,
        inputStream: got.stream(fileUrl, {
            headers: {
                Range: `bytes=${startPosition}-`
            }
        })
    }
}

const fetchZipStream = async (fileUrl: string, fileName: string) => {
    //current build doesn't support custom path. Once that release will remove the request dependency.
    // const customSource = {
    //     stream: (offset: number, length: number) => {
    //         return got.stream(fileUrl, {
    //             headers: {
    //                 'Range': `bytes=${offset}-${offset + length}`
    //             }
    //         });
    //     },
    //     size: async () => {
    //         const { headers } = await got.head(fileUrl);
    //         const contentLen = parseInt(headers['content-length'] || '');
    //         return contentLen;  //fallback to other method if needed            
    //     }
    // };

    const directory = await Open.url(request, fileUrl);
    // const directory = await unzipper.Open.url('', {

    // })

    const requestedFileStream = directory.files
        .filter((x: any) => x.type == "File" && basename(x.path) === basename(fileName))
        .pop();

    if (requestedFileStream) {
        return {
            size: requestedFileStream.uncompressedSize,
            inputStream: requestedFileStream.stream()
        }
    }

    throw new Error('Unable to find the matching stream!!!');
}

const fetchStatusOfRemoteUpload = async (remoteUrl: string) => {

    const resp = await got.put(remoteUrl, {
        throwHttpErrors: false
    });

    if (resp.statusCode === 308) {
        const { range } = resp.headers;
        if (range) {
            const byteEndRange = parseInt(range.split('-').pop() || '0');
            return {
                rangeEnd: byteEndRange
            }
        }
    } else {
        return null;
    }
    console.log(resp.headers)
}