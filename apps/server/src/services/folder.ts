import type { Folder, NewFolder } from '../db/schema.js'
import { asc, eq, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { folders } from '../db/schema.js'

/**
 * 创建文件夹
 */
export async function createFolder(data: {
  name: string
  parentId?: string | null
}): Promise<Folder> {
  const id = crypto.randomUUID()
  const now = new Date()

  // 计算同级文件夹的排序值
  const siblings = await db
    .select()
    .from(folders)
    .where(data.parentId ? eq(folders.parentId, data.parentId) : isNull(folders.parentId))

  const newFolder: NewFolder = {
    id,
    name: data.name,
    parentId: data.parentId ?? null,
    sortOrder: siblings.length,
    createdAt: now,
  }

  await db.insert(folders).values(newFolder)

  const [folder] = await db
    .select()
    .from(folders)
    .where(eq(folders.id, id))

  return folder
}

/**
 * 获取文件夹
 */
export async function getFolder(id: string): Promise<Folder | null> {
  const [folder] = await db
    .select()
    .from(folders)
    .where(eq(folders.id, id))

  return folder || null
}

/**
 * 获取文件夹树（所有文件夹，前端构建树形结构）
 */
export async function listFolders(): Promise<Folder[]> {
  return db
    .select()
    .from(folders)
    .orderBy(asc(folders.sortOrder), asc(folders.name))
}

/**
 * 获取子文件夹
 */
export async function getChildFolders(parentId: string | null): Promise<Folder[]> {
  return db
    .select()
    .from(folders)
    .where(parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId))
    .orderBy(asc(folders.sortOrder), asc(folders.name))
}

/**
 * 更新文件夹
 */
export async function updateFolder(
  id: string,
  data: { name?: string, parentId?: string | null, sortOrder?: number },
): Promise<Folder | null> {
  const existing = await getFolder(id)
  if (!existing)
    return null

  const updates: Partial<NewFolder> = {}
  if (data.name !== undefined)
    updates.name = data.name
  if (data.parentId !== undefined)
    updates.parentId = data.parentId
  if (data.sortOrder !== undefined)
    updates.sortOrder = data.sortOrder

  await db
    .update(folders)
    .set(updates)
    .where(eq(folders.id, id))

  return getFolder(id)
}

/**
 * 删除文件夹（级联删除子文件夹，笔记的 folderId 会被置为 null）
 */
export async function deleteFolder(id: string): Promise<boolean> {
  const existing = await getFolder(id)
  if (!existing)
    return false

  await db.delete(folders).where(eq(folders.id, id))
  return true
}
