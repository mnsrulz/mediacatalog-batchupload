import { z } from "zod";

export const RequestItemResponseSchema = z.object({
    id: z.string(),
    requestId: z.string(),
    fileUrl: z.string(),
    fileSize: z.number().positive().int(),
    parentUrl: z.string(),
    remoteUrl: z.string(),
    rawUpload: z.boolean(),
    fileName: z.string(),
    fileUrlHeaders: z.record(z.string(), z.string()),
    started: z.boolean(),
});

export const BatchUploadSchema = z.union([
    RequestItemResponseSchema,
    z.array(RequestItemResponseSchema),
]);

export const UrlCheckSchema = z.object({
    fileUrl: z.string(),
    fileUrlHeaders: z.record(z.string(), z.string()).optional().default({}),
});