import { throttle } from 'throttle-debounce';
import { RequestItemResponse, UploadProgress } from "./Models";
const MAX_CHUNK_SIZE = 4 * 1024 * 1024 * 1024; //4GB
export const uploadAsync = async (queuedItem: RequestItemResponse, onProgress: (prog: UploadProgress) => any) => {
    const { fileUrl, fileName, rawUpload, remoteUrl, fileUrlHeaders } = queuedItem;
    console.log('Initializing the upload...')
    let uploadedBytes = 0, size = 0, resumeFromPosition = 0;
    if (rawUpload) {
        const { rangeEnd } = await fetchStatusOfRemoteUpload(remoteUrl);
        rangeEnd >= 0 && console.log(`RawUploadMode on! Will resume from position ${rangeEnd}`); //if we get something gte 0 then it's a resume upload!
        resumeFromPosition = rangeEnd + 1;
        uploadedBytes = rangeEnd + 1;
    } else {
        throw new Error(`Only raw streams are currently supported!`);
    }

    const throttleProgress = throttle(300, () => {
        const percentage = Math.round((uploadedBytes / size) * 100);
        console.log(`Piping file: ${uploadedBytes} bytes (${percentage ?? 'unknown'}%)`);

        onProgress({
            percent: percentage,
            transferred: uploadedBytes,
            total: size
        })
    });

    const r = await fetch(fileUrl, {
        headers: {
            ...fileUrlHeaders,
            'Range': `bytes=${resumeFromPosition}-`
        }
    });

    const contentRangeHeader = r.headers.get('Content-Range');  //Content-Range: bytes 0-423483202/423483203
    const contentLengthHeader = r.headers.get('Content-Length');
    size = parseInt(r.headers.get('Content-Range')?.split('/').pop() || '0');

    if (!contentRangeHeader) throw new Error('Content Range header must be present from the upstream url');
    if (!contentLengthHeader) throw new Error('Content Length header must be present from the upstream url');
    if (!size || size <= 0) throw new Error('Size must be defined');

    const i = setInterval(() => {
        const percentage = Math.round((uploadedBytes / size) * 100);
        console.log(`Piping file: ${uploadedBytes} bytes (${percentage ?? 'unknown'}%)`);

        onProgress({
            percent: percentage,
            transferred: uploadedBytes,
            total: size
        })
    }, 1000);

    const progressStream = r.body?.pipeThrough(new TransformStream({
        transform(chunk, ctrl) {
            uploadedBytes += chunk.byteLength;
            //throttleProgress();
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
            'Content-Range': contentRangeHeader,
            'Content-Length': contentLengthHeader
        },
        body: progressStream,
        // @ts-ignore - 'duplex' is required by standard web fetch for streaming bodies
        duplex: 'half'
    });
    const output = await putresponse.text();
    console.log(`Upload completed with ${putresponse.status} | ${output}...`);
    clearInterval(i);
}

//returns the position till the data was previously uploaded. Returns -1 if no data was previously uploaded.
const fetchStatusOfRemoteUpload = async (remoteUrl: string) => {
    console.log(`Checking remote upload status: ${remoteUrl}`);
    const resp = await fetch(remoteUrl, {
        method: 'PUT',
        headers: {
            'Content-Length': '0',
            'Content-Range': `bytes */*`
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