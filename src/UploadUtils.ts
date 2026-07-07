import { throttle } from 'throttle-debounce';
import { RequestItemResponse, UploadProgress } from "./Models";
import { env } from "cloudflare:workers";

const MAX_CHUNK_SIZE = 64 * 1024 * 1024; //64MB
export const uploadAsync = async (queuedItem: RequestItemResponse, onProgress: (prog: UploadProgress) => any
) => {
    const { fileUrl, fileName, rawUpload, remoteUrl, fileUrlHeaders, fileSize } = queuedItem;
    console.log('Initializing the upload...')
    let uploadedBytes = 0, size = 0, resumeFromPosition = 0;
    if (rawUpload) {
        const { rangeEnd } = await fetchStatusOfRemoteUpload(remoteUrl);
        //rangeEnd >= 0 && console.log(`RawUploadMode on! Will resume from position ${rangeEnd}`); //if we get something gte 0 then it's a resume upload!
        resumeFromPosition = rangeEnd + 1;
        uploadedBytes = rangeEnd + 1;
    } else {
        throw new Error(`Only raw streams are currently supported!`);
    }

    const throttleProgress = throttle(300, () => {
        const percentage = Math.round((uploadedBytes / size) * 100);
        console.log(`Piping file: ${uploadedBytes} bytes (${percentage ?? 'unknown'}%)`);

        // onProgress({
        //     percent: percentage,
        //     transferred: uploadedBytes,
        //     total: size
        // })
    });

    const endPosition = Math.min(fileSize, resumeFromPosition + MAX_CHUNK_SIZE);
    const isLastRequest = endPosition == fileSize;
    const r = await fetch(fileUrl, {
        headers: {
            ...fileUrlHeaders,
            'Range': `bytes=${resumeFromPosition}-${endPosition - 1}`
        }
    });

    const contentRangeHeader = r.headers.get('Content-Range');  //Content-Range: bytes 0-423483202/423483203
    const contentLengthHeader = r.headers.get('Content-Length');
    size = parseInt(r.headers.get('Content-Range')?.split('/').pop() || '0');

    if (!contentRangeHeader) throw new Error('Content Range header must be present from the upstream url');
    if (!contentLengthHeader) throw new Error('Content Length header must be present from the upstream url');
    if (!size || size <= 0) throw new Error('Size must be defined');

    // const i = setInterval(() => {
    //     const percentage = Math.round((uploadedBytes / size) * 100);
    //     console.log(`Piping file: ${uploadedBytes} bytes (${percentage ?? 'unknown'}%)`);

    //     onProgress({
    //         percent: percentage,
    //         transferred: uploadedBytes,
    //         total: size
    //     })
    // }, 1000);

    // const progressStream = r.body?.pipeThrough(new TransformStream({
    //     transform(chunk, ctrl) {
    //         uploadedBytes += chunk.byteLength;
    //         //throttleProgress();
    //         ctrl.enqueue(chunk);
    //     }
    // }))

    const buf = await r.arrayBuffer();

    console.log(`Finished reading the buffer in memory.`);

    // const progressStream = new ReadableStream({
    //     async start(controller) {
    //         console.log(`Starting the stream...`);
    //         if (r.body) {
    //             for await (const chunk of r.body) {
    //                 controller.enqueue(chunk);
    //                 //uploadedBytes += chunk.byteLength;
    //                 //console.log(`Uploaded ${uploadedBytes}....`);
    //             }
    //         }
    //     }
    // })

    // console.log(`Response headers:
    //     status: ${r.status}
    //     Content-Length: ${r.headers.get('Content-Length')}
    //     Content-Range: ${r.headers.get('Content-Range')}
    //     `);

    const putresponse = await fetch(remoteUrl, {
        method: 'PUT',
        headers: {
            'Content-Range': contentRangeHeader,
            'Content-Length': contentLengthHeader
        },
        body: buf
    });
    const output = await putresponse.json();
    console.log(`Upload chunk with size ${contentLengthHeader} bytes completed with ${putresponse.status} | ${output}...`);

    const percentage = Math.round((uploadedBytes / size) * 100);

    await onProgress({
        percent: percentage,
        transferred: uploadedBytes,
        total: size
    });

    return isLastRequest;
}

export const uploadAsyncV2 = async (queuedItem: RequestItemResponse, onProgress: (prog: UploadProgress) => any
) => {
    const { fileUrl, fileName, rawUpload, remoteUrl, fileUrlHeaders, fileSize } = queuedItem;
    console.log('Initializing the upload...')
    let uploadedBytes = 0, resumeFromPosition = 0;
    if (rawUpload) {
        while (true) {
            try {
                const { rangeEnd } = await fetchStatusOfRemoteUpload(remoteUrl);
                resumeFromPosition = rangeEnd + 1;
                uploadedBytes = rangeEnd + 1;

                // optimize it later
                const percentage = Math.round((uploadedBytes / fileSize) * 100);
                await onProgress({
                    percent: percentage,
                    transferred: uploadedBytes,
                    total: fileSize
                });
                const sh = fileUrlHeaders || {};
                sh['Range'] = `bytes=${resumeFromPosition}-${fileSize - 1}`;

                const utoCall = new URL(env.STREAM_PIPER_URL);
                utoCall.searchParams.append('s', fileUrl);
                utoCall.searchParams.append('t', remoteUrl);

                Object.keys(sh).forEach(k => {
                    utoCall.searchParams.append('sh', `${k}:${sh[k]}`);
                })

                console.log(`issuing the fetch request to ${utoCall}`);
                const resp = await fetch(utoCall);
                console.log(`${resp.status} - Response: ${await resp.text()}`);
            } catch (e) {
                console.error(`Re issuing the request after encoutering the error, ${e}`);
            }
            return true;
        }
    } else {
        throw new Error(`Only raw streams are currently supported!`);
    }
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