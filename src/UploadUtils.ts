import ky from "ky";
import { throttle } from 'throttle-debounce';
import { RequestItemResponse, UploadProgress } from "./Models";
import { Open } from 'unzipper';
import { basename } from "path";
import Stream, { Readable } from "stream";
const MAX_CHUNK_SIZE = 4 * 1024 * 1024 * 1024; //4GB
export const uploadAsync = async (queuedItem: RequestItemResponse, onProgress: (prog: UploadProgress) => any) => {
    const { fileUrl, fileName, rawUpload, remoteUrl, fileUrlHeaders } = queuedItem;
    console.log('Initializing the upload...')

    let resumeFromPosition = 0;
    if (rawUpload) {
        const { rangeEnd } = await fetchStatusOfRemoteUpload(remoteUrl, 0);
        rangeEnd >= 0 && console.log(`RawUploadMode on! Will resume from position ${rangeEnd}`); //if we get something gte 0 then it's a resume upload!
        resumeFromPosition = rangeEnd + 1;
    }

    //rawUpload ? await fetchRawStream(fileUrl, resumeFromPosition, fileUrlHeaders) : 
    const { fileStream, size, rangeHeader } = await fetchZipStream(fileUrl, fileName, fileUrlHeaders)

    let uploadedBytes = 0;
    const throttleProgress = throttle(300, () => {
        const percentage = Math.round((uploadedBytes / size) * 100);
        console.log(`Piping file: ${uploadedBytes} bytes (${percentage ?? 'unknown'}%)`);

        onProgress({
            percent: percentage,
            transferred: uploadedBytes,
            total: size
        })
    });


    const { rangeEnd } = await fetchStatusOfRemoteUpload(remoteUrl, size);
    console.log(`Status of upload: ${rangeEnd}. ${rangeEnd == -1 ? '-1 indicating the upload is not yet started' : ''}`);

    uploadedBytes = rangeEnd + 1;

    const { offsetToLocalFileHeader } = fileStream;
    const zipStreamStartRange = rangeEnd + offsetToLocalFileHeader + 1;
    const zipStreamEndRange = Math.min(fileStream.compressedSize - 1, rangeEnd + MAX_CHUNK_SIZE) + offsetToLocalFileHeader;


    const rng = `bytes ${zipStreamStartRange - offsetToLocalFileHeader}-${zipStreamEndRange - offsetToLocalFileHeader}/${size}`;

    const r = await fetch(fileUrl, {
        headers: {
            ...fileUrlHeaders,
            'Range': `bytes=${zipStreamStartRange}-${zipStreamEndRange}`
        }
    });

    const progressStream = r.body?.pipeThrough(new TransformStream({
        transform(chunk, ctrl) {
            uploadedBytes += chunk.byteLength;
            throttleProgress();
            ctrl.enqueue(chunk);
        }
    }))

    console.log(`Response headers:
        status: ${r.status}
        Content-Length: ${r.headers.get('Content-Length')}
        Content-Range: ${r.headers.get('Content-Range')}
        `);

    const putresponse = await fetch(remoteUrl, {
        method: 'PUT',
        headers: {
            'Content-Range': rng,
            'Content-Length': `${size}`
        },
        body: progressStream
    });
    const output = await putresponse.text();
    console.log(`Upload completed with ${putresponse.status} | ${output}...`);
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
    console.log(`Fetching zip stream for URL: ${fileUrl}`);
    const directory = await Open.custom({
        size: async () => {
            console.log(`Fetching size of zip stream for URL: ${fileUrl}`);
            const { headers } = await ky.head(fileUrl, { headers: fileUrlHeaders })
            return parseInt(headers.get('content-length') || '0');
        },
        stream: (offset, length) => {
            console.log(`Streaming the zip for URL: ${fileUrl}, offset: ${offset}, len: ${length}`);
            const stream = new Stream.PassThrough();
            const to = length > 0 ? `${offset + length - 1}` : '';
            ky(fileUrl, {
                headers: { ...fileUrlHeaders, Range: `bytes=${offset}-${to}` }
            }).then(k => Readable.fromWeb(k.body as any).pipe(stream))
            return stream;
        }
    })

    const requestedFileStream = directory.files
        .filter((x: any) => x.type == "File" && basename(x.path) === basename(fileName))
        .pop();

    if (requestedFileStream) {
        console.log(`Requested file stream successfully, now streaming the zip for 
            URL: ${fileUrl}
            fileNameLength: ${requestedFileStream.fileNameLength}
            compressedSize: ${requestedFileStream.compressedSize}
            fileCommentLength: ${requestedFileStream.fileCommentLength}
            offsetToLocalFileHeader: ${requestedFileStream.offsetToLocalFileHeader}
            uncompressedSize: ${requestedFileStream.uncompressedSize}
            compressionMethod: ${requestedFileStream.compressionMethod}
            `);
        const contentLen = requestedFileStream.uncompressedSize
        return {
            size: contentLen,
            fileStream: requestedFileStream,
            rangeHeader: `bytes 0-${contentLen - 1}/${contentLen}`
        }
    }
    throw new Error('Unable to find the matching stream!!!');
}

//returns the position till the data was previously uploaded. Returns -1 if no data was previously uploaded.
const fetchStatusOfRemoteUpload = async (remoteUrl: string, size: number) => {
    console.log(`Checking remote upload status: ${remoteUrl} with size: ${size}`);
    const resp = await fetch(remoteUrl, {
        method: 'PUT',
        headers: {
            'Content-Length': '0',
            'Content-Range': `bytes */${size}`
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
        throw new Error(`Expected 308 status code but received ${resp.status}, ${await resp.text()}`);
    }
}