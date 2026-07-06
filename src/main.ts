import { Hono } from "hono";
import { RequestItemResponse } from "./Models";
import { processItem } from "./BatchUploadRequestProcessor";
import type { ExecutionContext, MessageBatch, Queue } from "@cloudflare/workers-types";
type Env = {
	BATCHUPLOADQUEUE: Queue;
	API_TOKEN: string;
	API_BASE_URL: string;
	API_KEY: string;
};

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

const apiKeyAuth = (key: string) => async (c: any, next: any) => {
	if (c.req.header('x-api-key') !== key) {
		return c.json({ error: 'Unauthorized' }, 401)
	}
	await next()
}

app.onError((err, c) => {
	console.error("Global error handler caught:", err); // Log the error if it's not known

	return c.json(
		{
			success: false,
			errors: [{ code: 7000, message: "Internal Server Error" }],
		},
		500,
	);
});

app.use('/api/*', (c, next) => apiKeyAuth(c.env.API_KEY)(c, next));
app.get('/', (c) => {
	return c.json({ message: 'Hello, World from cf!!' });
})

app.post('/batchupload', async (c) => {
	const json = await c.req.json<RequestItemResponse | RequestItemResponse[]>();
	if (Array.isArray(json)) {
		await c.env.BATCHUPLOADQUEUE.sendBatch(json.map((item) => ({
			body: item
		})));
	} else {
		await c.env.BATCHUPLOADQUEUE.send(json);
	}

	return c.json({ message: 'Batch upload request received' });
});

// Export the Hono app
export default {
	fetch: app.fetch,
	async queue(batch: MessageBatch<RequestItemResponse>, env: Env, ctx: ExecutionContext) {

		console.log(`Received a batch of ${batch.messages.length} messages`);
		for (const message of batch.messages) {
			try {
				const result = await processItem(message.body);
				message.ack();
				if (!result) {	//there is more to upload
					console.log(`Requeuing the message for pending upload.`)
					await env.BATCHUPLOADQUEUE.send(message.body);
				}
			} catch (error) {
				message.retry();
			}
		}
	}
};

