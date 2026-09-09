import type { Tag } from '../types'

/** Merge label groups (first page of the library + an item's current labels)
 * into one candidate list, so ids that are selected but sit beyond the loaded
 * page still resolve to a name and stay visible. */
export function mergeLabelCandidates(...groups: Array<Tag[] | undefined>): Tag[] {
  const map = new Map<number, Tag>()
  for (const group of groups) {
    for (const tag of group ?? []) map.set(tag.id, tag)
  }
  return [...map.values()]
}
