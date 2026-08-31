import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

/**
 * Api database — `docs/03-technical-design.md` §6. Foreign keys stay
 * *inside* this database (cross-service references are ids only, never
 * FKs). Deletes cascade downwards (user → albums → images → processed
 * images) so removing an aggregate root can never leave orphan rows behind.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * One row per issued code. The plaintext code never lands here — only its
 * sha256 hash plus the per-code salt (docs/03 §5). `consumed_at` doubles as
 * the invalidation marker: a code is active while it is unconsumed and unexpired.
 */
export const otpCodes = pgTable(
  'otp_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    salt: text('salt').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Every verify/request hits this table by email — the one lookup path.
  (table) => [index('otp_codes_email_idx').on(table.email)],
)

export const albums = pgTable(
  'albums',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('albums_owner_id_idx').on(table.ownerId)],
)

export const images = pgTable(
  'images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    albumId: uuid('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storagePath: text('storage_path').notNull(),
    // Nullable: only populated by the upload route (sharp metadata read,
    // docs/03 §7); pre-existing rows/tests that insert without dimensions
    // stay valid. `updatedAt` mirrors `albums` so the api's `Image` schema
    // (packages/shared) always has a value to serialize.
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // The gallery lists images album by album.
  (table) => [index('images_album_id_idx').on(table.albumId)],
)

/**
 * Result of one `POST /images/process` run. `params_hash` is the sha256 of
 * the canonical params JSON (docs/03 §7); the unique pair (image, hash)
 * makes the cache lookup a single indexed read and stops the same
 * transformation being stored twice.
 */
export const processedImages = pgTable(
  'processed_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    imageId: uuid('image_id')
      .notNull()
      .references(() => images.id, { onDelete: 'cascade' }),
    paramsHash: text('params_hash').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    filter: text('filter').notNull(),
    quality: integer('quality').notNull(),
    storagePath: text('storage_path').notNull(),
    durationMs: integer('duration_ms').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.imageId, table.paramsHash)],
)
