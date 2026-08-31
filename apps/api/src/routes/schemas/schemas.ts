import { z } from 'zod'

/** Every `:id` route param in this API is a uuid primary key. */
export const entityIdParamsSchema = z.object({ id: z.string().uuid() })
