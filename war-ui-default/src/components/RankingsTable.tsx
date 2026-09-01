// Renders the leaderboard returned by GET /rankings (war-ui-default-spec.md
// §6). The UI performs no ranking arithmetic and never re-sorts: rows
// render in the exact order the API returned, and `rank` renders exactly
// as given — "—" for an unranked (`rank: null`) contestant. No win
// percentage is computed or displayed anywhere here.
import type { RankingsResponse } from '../api/client'
import { ContestantThumbnail } from './ContestantThumbnail'

type RankingEntry = RankingsResponse['rankings'][number]

interface RankingsTableProps {
  rankings: RankingEntry[]
}

export function RankingsTable({ rankings }: RankingsTableProps) {
  return (
    <table data-testid="rankings-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Image</th>
          <th>Name</th>
          <th>Wins</th>
          <th>Appearances</th>
        </tr>
      </thead>
      <tbody>
        {rankings.map((entry) => (
          <RankingsRow key={entry.contestant.id} entry={entry} />
        ))}
      </tbody>
    </table>
  )
}

function RankingsRow({ entry }: { entry: RankingEntry }) {
  return (
    <tr data-testid="ranking-row">
      <td>{entry.rank ?? '—'}</td>
      <td>
        <ContestantThumbnail media={entry.contestant.media} name={entry.contestant.name} />
      </td>
      <td>{entry.contestant.name}</td>
      <td>{entry.wins}</td>
      <td>{entry.appearances}</td>
    </tr>
  )
}
