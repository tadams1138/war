// The merged War detail results list (war-spec.md 10.1, 10.4): one row per
// contestant, ordered exactly as the rankings API returns it (never
// re-sorted), each carrying that contestant's browsable media, name, bio,
// and declared attributes alongside its rank/wins/appearances. Replaces
// what used to be two separate sections — a contestant gallery driven by
// GET /wars/:id and a leaderboard driven by GET /wars/:id/rankings.
//
// Column widths are fixed via <colgroup> (bio ~50%, image ~25%, the four
// narrow numeric/visual columns ~25% combined) so a short bio never lets
// media balloon to fill the row, and a long one never squeezes media past
// legibility either.
import type { ContestantDetail, RankingsResponse } from '../api/client'
import { BioContent } from '../bio/BioContent'
import { ContestantAttributes } from './ContestantAttributes'
import { ImageCarousel } from './ImageCarousel'

type RankingEntry = RankingsResponse['rankings'][number]

interface ResultsTableProps {
  rankings: RankingEntry[]
  // Bio and attributes live only in the War-detail response, not the
  // rankings one — joined in here by contestant id.
  contestants: ContestantDetail[]
}

function contestantDetailsById(contestants: ContestantDetail[]): Map<string, ContestantDetail> {
  return new Map(contestants.map((contestant) => [contestant.id, contestant]))
}

// A bar sized by this contestant's raw wins relative to the leader's —
// never wins over appearances. §7 rejects any appearance-normalized
// percentage as a display value (it would let a 3-for-3 contestant outrank
// a 320-of-400 one); this bar visualizes the same raw win count already
// shown as a number in the Wins column, nothing derived from appearances.
function winShare(wins: number, maxWins: number): number {
  return maxWins === 0 ? 0 : Math.round((wins / maxWins) * 100)
}

export function ResultsTable({ rankings, contestants }: ResultsTableProps) {
  const detailsById = contestantDetailsById(contestants)
  const maxWins = Math.max(0, ...rankings.map((entry) => entry.wins))
  return (
    <table data-testid="rankings-table" className="rankings-table">
      <colgroup>
        <col className="col-rank" />
        <col className="col-image" />
        <col className="col-contestant" />
        <col className="col-wins" />
        <col className="col-appearances" />
        <col className="col-win-share" />
      </colgroup>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Image</th>
          <th>Contestant</th>
          <th>Wins</th>
          <th>Appearances</th>
          <th>Win share</th>
        </tr>
      </thead>
      <tbody>
        {rankings.map((entry) => (
          <ResultsRow key={entry.contestant.id} entry={entry} detail={detailsById.get(entry.contestant.id)} maxWins={maxWins} />
        ))}
      </tbody>
    </table>
  )
}

function ResultsRow({
  entry,
  detail,
  maxWins,
}: {
  entry: RankingEntry
  detail: ContestantDetail | undefined
  maxWins: number
}) {
  return (
    <tr data-testid="ranking-row">
      <td>{entry.rank ?? '—'}</td>
      <td>
        <div className="results-media">
          <ImageCarousel
            media={entry.contestant.media}
            onTap={() => {}}
            ariaLabel={`${entry.contestant.name}'s photos — swipe or use the arrows to browse`}
          />
        </div>
      </td>
      <td>
        <span className="results-name">{entry.contestant.name}</span>
        {detail && <BioContent bio={detail.bio} />}
        {detail && <ContestantAttributes attributes={detail.attributes} />}
      </td>
      <td>{entry.wins}</td>
      <td>{entry.appearances}</td>
      <td>
        <div className="win-bar-track">
          <div className="win-bar-fill" style={{ width: `${winShare(entry.wins, maxWins)}%` }} />
        </div>
      </td>
    </tr>
  )
}
