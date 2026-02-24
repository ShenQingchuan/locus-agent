import type { Tag } from '../db/schema.js'
import { asc, eq } from 'drizzle-orm'
import { db, noteTags, tags } from '../db/index.js'

/**
 * 获取或创建标签（按名称去重）
 */
export async function getOrCreateTag(name: string): Promise<Tag> {
  const trimmed = name.trim().toLowerCase()

  const [existing] = await db
    .select()
    .from(tags)
    .where(eq(tags.name, trimmed))

  if (existing)
    return existing

  const id = crypto.randomUUID()
  const now = new Date()

  await db.insert(tags).values({
    id,
    name: trimmed,
    createdAt: now,
  })

  const [tag] = await db
    .select()
    .from(tags)
    .where(eq(tags.id, id))

  return tag
}

/**
 * 获取所有标签
 */
export async function listTags(): Promise<Tag[]> {
  return db
    .select()
    .from(tags)
    .orderBy(asc(tags.name))
}

/**
 * 获取标签（附带使用计数）
 */
export async function listTagsWithCount(): Promise<(Tag & { noteCount: number })[]> {
  const allTags = await listTags()
  const result: (Tag & { noteCount: number })[] = []

  for (const tag of allTags) {
    const usages = await db
      .select()
      .from(noteTags)
      .where(eq(noteTags.tagId, tag.id))

    result.push({ ...tag, noteCount: usages.length })
  }

  return result
}

/**
 * 删除标签
 */
export async function deleteTag(id: string): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(tags)
    .where(eq(tags.id, id))

  if (!existing)
    return false

  // 级联删除会自动清理 note_tags 关联
  await db.delete(tags).where(eq(tags.id, id))
  return true
}

/**
 * 重命名标签
 */
export async function renameTag(id: string, newName: string): Promise<Tag | null> {
  const [existing] = await db
    .select()
    .from(tags)
    .where(eq(tags.id, id))

  if (!existing)
    return null

  const trimmed = newName.trim().toLowerCase()

  await db
    .update(tags)
    .set({ name: trimmed })
    .where(eq(tags.id, id))

  const [updated] = await db
    .select()
    .from(tags)
    .where(eq(tags.id, id))

  return updated
}
