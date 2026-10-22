// What a Moderator sees on a War's detail page besides what everyone sees
// (war-spec.md §6.7, §10.4): its reports and the Remove control. A removed War
// can no longer be removed or reported on, so it offers neither.
import type { WarDetailResponse } from '../../api/client'
import { canModerate } from '../../auth/roles'
import { useViewer } from '../../auth/useViewer'
import { RemoveWarControl } from './RemoveWarControl'
import { WarReportsSection } from './WarReportsSection'

export function ModeratorSection({ war, onChanged }: { war: WarDetailResponse; onChanged: () => void }) {
  const viewer = useViewer()
  if (!viewer || !canModerate(viewer) || war.removed_at !== null) return null
  return (
    <>
      <RemoveWarControl warId={war.id} onRemoved={onChanged} />
      <WarReportsSection warId={war.id} />
    </>
  )
}
