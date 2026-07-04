import { Hono } from "hono";
// Start a Hono app
const app = new Hono();

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

app.get('/', (c) => {
	return c.json({ message: 'Hello, World from cf!!!' });
})

// Export the Hono app
export default app;