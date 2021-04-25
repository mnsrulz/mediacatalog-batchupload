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
import fetch from 'node-fetch';

export const uploadAsync = async (queuedItem: RequestItemResponse, onProgress: (prog: UploadProgress) => any) => {
    const { fileUrl, fileName, rawUpload, remoteUrl } = queuedItem;
    logger('Initializing the upload...')

    let resumeFromPosition = 0;
    if (rawUpload) {
        const { rangeEnd } = await fetchStatusOfRemoteUpload(remoteUrl);
        rangeEnd >= 0 && logger(`RawUploadMode on! Will resume from position ${rangeEnd}`); //if we get something gte 0 then it's a resume upload!
        resumeFromPosition = rangeEnd + 1;
    }

    const { inputStream, size, rangeHeader } = rawUpload ? await fetchRawStream(fileUrl, resumeFromPosition) : await fetchZipStream(fileUrl, fileName)
    const { uploadStream, promise } = prepareUploadStream(remoteUrl, rangeHeader, size);

    if (inputStream instanceof ReadableStream) {
        logger('input stream is of type readable.. hooking up the event of error!');
        inputStream.on('error', err => {
            logger('error occurred in the readable stream. ending the upload stream.');
            uploadStream.end();
            logger('upload stream ended.')
        });
    }

    let lastPercentCaptured = 0;
    const timer = setInterval(() => {
        const { total, transferred, percent } = uploadStream.uploadProgress;
        logger(`Progress: ### ${percent}% ### ${transferred}/${total}`);
        if (percent > lastPercentCaptured) {
            //only report if there's a change
            lastPercentCaptured = percent;
            onProgress(uploadStream.uploadProgress);
        }
    }, 1000);
    try {
        await pipelineAsync(
            inputStream,
            uploadStream
        );
        logger('pipeline async completed!');
        await promise;
        logger('upload stream promise completed!')
    } catch (error) {
        logger('error occurrerd during upload.', error);
        throw error;
    } finally {
        clearInterval(timer);
    }
    logger('Upload completed...');
}

const prepareUploadStream = (remoteUrl: string, contentRangeHeader: string, contentLen: number) => {
    let _resolve: any;
    let _reject: any;
    const promise = new Promise((res, rej) => {
        _resolve = res;
        _reject = rej;
    });

    const uploadStream = got.stream.put(remoteUrl, {
        headers: {
            'Content-Range': contentRangeHeader,
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
    let rangeHeader;
    let headers = {};
    if (startPosition > 0) {
        //it's a resume upload
        headers = {
            Range: `bytes=${startPosition}-`
        }
    }
    const response = await fetch(fileUrl, {
        headers
    });
    if (!response.ok) throw new Error(`Expected 200 status code but recieved ${response.status}`);
    const contentLength = parseInt(response.headers.get('content-length') || '');

    if (startPosition > 0) {
        rangeHeader = response.headers.get('content-range');
        if (!rangeHeader) throw new Error('range header was expected!');
    } else {
        rangeHeader = `bytes 0-${contentLength - 1}/${contentLength}`
    }
    return {
        size: contentLength,
        inputStream: response.body,
        rangeHeader
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
        const contentLen = requestedFileStream.uncompressedSize
        return {
            size: contentLen,
            inputStream: requestedFileStream.stream(),
            rangeHeader: `bytes 0-${contentLen - 1}/${contentLen}`
        }
    }

    throw new Error('Unable to find the matching stream!!!');
}

//returns the position till the data was previously uploaded. Returns -1 if no data was previously uploaded.
const fetchStatusOfRemoteUpload = async (remoteUrl: string) => {
    const resp = await got.put(remoteUrl, {
        throwHttpErrors: false,
        headers: {
            'Content-Length': '0',
            'Content-Range': 'bytes */*'
        }
    });

    if (resp.statusCode === 308) {
        const { range } = resp.headers;
        let rangeEnd = -1;
        if (range) {
            rangeEnd = parseInt(range.split('-').pop() || '-1');
        }
        return {
            rangeEnd
        }
    } else {
        throw new Error(`Expected 308 status code but received ${resp.statusCode}`);
    }
}