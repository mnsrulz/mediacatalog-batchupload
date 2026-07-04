import ky from "ky";
import { promisify } from 'util';
import Stream, { pipeline, Readable } from 'stream';
import { RequestItemResponse, UploadProgress } from "./Models";
import { Open } from 'unzipper';
import { basename } from "path";

export const uploadAsync = async (queuedItem: RequestItemResponse, onProgress: (prog: UploadProgress) => any) => {
    const { fileUrl, fileName, rawUpload, remoteUrl, fileUrlHeaders } = queuedItem;
    console.log('Initializing the upload...')

    let resumeFromPosition = 0;
    if (rawUpload) {
        const { rangeEnd } = await fetchStatusOfRemoteUpload(remoteUrl);
        rangeEnd >= 0 && console.log(`RawUploadMode on! Will resume from position ${rangeEnd}`); //if we get something gte 0 then it's a resume upload!
        resumeFromPosition = rangeEnd + 1;
    }

    //rawUpload ? await fetchRawStream(fileUrl, resumeFromPosition, fileUrlHeaders) : 
    const { inputStream, size, rangeHeader } = await fetchZipStream(fileUrl, fileName, fileUrlHeaders)

    await ky.put(remoteUrl, {
        headers: {
            'Content-Range': rangeHeader,
            'Content-Length': `${size}`
        },
        body: Readable.from(inputStream) as any
    })


    // let lastPercentCaptured = 0;
    // const timer = setInterval(() => {
    //     const { total, transferred, percent } = uploadStream.uploadProgress;
    //     const uploadProgress = resumeFromPosition === 0 ? uploadStream.uploadProgress : {
    //         transferred: transferred + resumeFromPosition,
    //         total: total && total + resumeFromPosition,
    //         percent: (transferred + resumeFromPosition) / ((total || 0) + resumeFromPosition)
    //     } as UploadProgress;
    //     console.log(`Progress: ### ${uploadProgress.percent}% ### ${uploadProgress.transferred}/${uploadProgress.total}`);
    //     if (percent > lastPercentCaptured) {
    //         //only report if there's a change
    //         lastPercentCaptured = percent;
    //         onProgress(uploadProgress);
    //     }
    // }, 1000);
    // try {
    //     await pipelineAsync(
    //         inputStream,
    //         uploadStream
    //     );
    //     console.log('pipeline async completed!');
    //     await promise;
    //     console.log('upload stream promise completed!')
    // } catch (error) {
    //     console.log('error occurrerd during upload.', error);
    //     throw error;
    // } finally {
    //     clearInterval(timer);
    // }
    console.log('Upload completed...');
}

const fetchRawStream = async (fileUrl: string, startPosition: number, fileUrlHeaders: Record<string, string>) => {
    let rangeHeader;
    let headers = {};
    if (startPosition > 0) {
        //it's a resume upload
        headers = {
            Range: `bytes=${startPosition}-`
        }
    }
    headers = Object.assign(headers, fileUrlHeaders);
    const gthead = await ky.head(fileUrl, { headers });
    const gtstream = await ky(fileUrl, { headers });

    const contentLength = parseInt(gthead.headers.get('content-length') || '');
    if (startPosition > 0) {
        rangeHeader = gthead.headers.get('content-range');
        if (!rangeHeader) throw new Error('range header was expected!');
    } else {
        rangeHeader = `bytes 0-${contentLength - 1}/${contentLength}`
    }
    return {
        size: contentLength,
        inputStream: gtstream.body,
        rangeHeader
    }
}

const fetchZipStream = async (fileUrl: string, fileName: string, fileUrlHeaders: Record<string, string>) => {
    const directory = await Open.custom({
        size: async () => {
            const { headers } = await ky.head(fileUrl, { headers: fileUrlHeaders })
            return parseInt(headers.get('content-length') || '0');
        },
        stream: (offset, length) => {
            const stream = new Stream.PassThrough();
            ky(fileUrl, {
                headers: { ...fileUrlHeaders, Range: `bytes=${offset}-${offset + length - 1}` }
            }).then(k => Readable.fromWeb(k.body as any).pipe(stream))
            return stream;
        }
    })

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
    const resp = await ky.put(remoteUrl, {
        throwHttpErrors: false,
        headers: {
            'Content-Length': '0',
            'Content-Range': 'bytes */*'
        }
    });

    if (resp.status === 308) {
        const range = resp.headers.get('range');
        let rangeEnd = -1;
        if (range) {
            rangeEnd = parseInt(range.split('-').pop() || '-1');
        }
        return {
            rangeEnd
        }
    } else {
        throw new Error(`Expected 308 status code but received ${resp.status}`);
    }
}