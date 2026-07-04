import { Hono } from "hono";
import { RequestItemResponse } from "./Models";
import { processItem } from "./BatchUploadRequestProcessor";
type Env = {
	BATCHUPLOADQUEUE: Queue;
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

app.use('/api/*', apiKeyAuth(process.env.API_KEY!))
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
				console.log(`Processing message with ID: ${JSON.stringify(message.body)}`);
				await processItem(message.body);
			} catch (error) {
				console.error(`Error processing message with ID: ${JSON.stringify(message.body)}`, error);
				// Optionally, you can choose to rethrow the error to let the queue handle retries
				throw error;
			}
		}
	}
};

