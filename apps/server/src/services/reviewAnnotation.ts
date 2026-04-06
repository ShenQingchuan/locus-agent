import type { NewReviewAnnotationGroup, NewReviewAnnotationRow, ReviewAnnotationGroup, ReviewAnnotationRow } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { reviewAnnotationGroups, reviewAnnotations } from '../db/schema.js'

export interface CreateGroupInput {
  id?: string
  projectKey: string
  title: string
}

export interface AddAnnotationInput {
  id?: string
  groupId: string
  filePath: string
  side: 'additions' | 'deletions'
  lineStart: number
  lineEnd: number
  comment: string
}

export interface FullGroup extends ReviewAnnotationGroup {
  annotations: ReviewAnnotationRow[]
}

export async function listGroupsByProject(projectKey: string): Promise<FullGroup[]> {
  const groups = await db
    .select()
    .from(reviewAnnotationGroups)
    .where(eq(reviewAnnotationGroups.projectKey, projectKey))

  const result: FullGroup[] = []
  for (const group of groups) {
    const anns = await db
      .select()
      .from(reviewAnnotations)
      .where(eq(reviewAnnotations.groupId, group.id))

    result.push({ ...group, annotations: anns })
  }

  return result
}

export async function createGroup(input: CreateGroupInput): Promise<FullGroup> {
  const id = input.id ?? crypto.randomUUID()
  const now = new Date()

  const newGroup: NewReviewAnnotationGroup = {
    id,
    projectKey: input.projectKey,
    title: input.title,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(reviewAnnotationGroups).values(newGroup)
  return { ...newGroup, annotations: [] } as FullGroup
}

export async function renameGroup(groupId: string, title: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: reviewAnnotationGroups.id })
    .from(reviewAnnotationGroups)
    .where(eq(reviewAnnotationGroups.id, groupId))

  if (!existing)
    return false

  await db
    .update(reviewAnnotationGroups)
    .set({ title, updatedAt: new Date() })
    .where(eq(reviewAnnotationGroups.id, groupId))

  return true
}

export async function deleteGroup(groupId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: reviewAnnotationGroups.id })
    .from(reviewAnnotationGroups)
    .where(eq(reviewAnnotationGroups.id, groupId))

  if (!existing)
    return false

  await db
    .delete(reviewAnnotationGroups)
    .where(eq(reviewAnnotationGroups.id, groupId))

  return true
}

export async function addAnnotation(input: AddAnnotationInput): Promise<ReviewAnnotationRow> {
  const id = input.id ?? crypto.randomUUID()
  const now = new Date()

  const row: NewReviewAnnotationRow = {
    id,
    groupId: input.groupId,
    filePath: input.filePath,
    side: input.side,
    lineStart: input.lineStart,
    lineEnd: input.lineEnd,
    comment: input.comment,
    createdAt: now,
  }

  await db.insert(reviewAnnotations).values(row)

  await db
    .update(reviewAnnotationGroups)
    .set({ updatedAt: now })
    .where(eq(reviewAnnotationGroups.id, input.groupId))

  return row as ReviewAnnotationRow
}

export async function updateAnnotation(annotationId: string, comment: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: reviewAnnotations.id })
    .from(reviewAnnotations)
    .where(eq(reviewAnnotations.id, annotationId))

  if (!existing)
    return false

  await db
    .update(reviewAnnotations)
    .set({ comment })
    .where(eq(reviewAnnotations.id, annotationId))

  return true
}

export async function removeAnnotation(annotationId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: reviewAnnotations.id })
    .from(reviewAnnotations)
    .where(eq(reviewAnnotations.id, annotationId))

  if (!existing)
    return false

  await db
    .delete(reviewAnnotations)
    .where(eq(reviewAnnotations.id, annotationId))

  return true
}

export async function clearAllByProject(projectKey: string): Promise<void> {
  await db
    .delete(reviewAnnotationGroups)
    .where(eq(reviewAnnotationGroups.projectKey, projectKey))
}
