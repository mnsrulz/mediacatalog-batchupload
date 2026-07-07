import { RequestItemResponse, UploadProgress } from "./Models";
import { env } from "cloudflare:workers";

export const uploadAsync = async (queuedItem: RequestItemResponse, onProgress: (prog: UploadProgress) => any
) => {
    const { fileUrl, fileName, rawUpload, remoteUrl, fileUrlHeaders, fileSize } = queuedItem;
    console.log('Initializing the upload...')
    let uploadedBytes = 0, resumeFromPosition = 0;
    if (rawUpload) {
        let i = 0;
        try {
            const { rangeEnd, completed } = await fetchStatusOfRemoteUpload(remoteUrl, fileSize);
            if (completed) return;
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
            i = setInterval(async () => {
                const { rangeEnd, completed } = await fetchStatusOfRemoteUpload(remoteUrl, fileSize);
                await onProgress({
                    percent: Math.round((uploadedBytes / fileSize) * 100),
                    transferred: rangeEnd + 1,
                    total: fileSize
                })
            }, 1000);
            const resp = await fetch(utoCall);
            console.log(`${resp.status} - Response: ${await resp.text()}`);
        } finally {
            clearInterval(i);
        }
    } else {
        throw new Error(`Only raw streams are currently supported!`);
    }
}

//returns the position till the data was previously uploaded. Returns -1 if no data was previously uploaded.
const fetchStatusOfRemoteUpload = async (remoteUrl: string, fileSize: number) => {
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
    } else if (resp.status === 200) {
        return {
            completed: true,
            rangeEnd: fileSize - 1
        }
    } else {
        throw new Error(`Expected 308 status code but received ${resp.status}, ${await resp.text()}`);
    }
}