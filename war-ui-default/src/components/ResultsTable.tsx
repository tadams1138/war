// The merged War detail results list (war-spec.md 10.1, 10.4): one entry per
// contestant, ordered exactly as the rankings API returns it (never
// re-sorted), each carrying that contestant's browsable media, name, bio,
// and declared attributes alongside its rank/wins/appearances. Replaces
// what used to be two separate sections — a contestant gallery driven by
// GET /wars/:id and a leaderboard driven by GET /wars/:id/rankings.
//
// An <ol>, not a <table>: rank is an ordering, not a column value, so a
// list gives every entry "item N of M" semantics for free, which neither a
// table's rank column nor a plain <div> would. Group widths (bio ~50%,
// image ~25%, the wins/appearances/win-share group ~25%) are set structurally
// in layout.css, restacking into a single column below its mobile
// breakpoint — a short bio never lets media balloon to fill the row, and a
// long one never squeezes media past legibility either, at any width.
import type { ContestantDetail, RankingsResponse } from '../api/client'
import { BioSnippet } from './BioSnippet'
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
// shown as a number in the Wins group, nothing derived from appearances.
function winShare(wins: number, maxWins: number): number {
  return maxWins === 0 ? 0 : Math.round((wins / maxWins) * 100)
}

export function ResultsTable({ rankings, contestants }: ResultsTableProps) {
  const detailsById = contestantDetailsById(contestants)
  const maxWins = Math.max(0, ...rankings.map((entry) => entry.wins))
  return (
    <ol data-testid="rankings-list" className="rankings-list">
      {rankings.map((entry) => (
        <ResultCard key={entry.contestant.id} entry={entry} detail={detailsById.get(entry.contestant.id)} maxWins={maxWins} />
      ))}
    </ol>
  )
}

function ResultCard({
  entry,
  detail,
  maxWins,
}: {
  entry: RankingEntry
  detail: ContestantDetail | undefined
  maxWins: number
}) {
  return (
    <li data-testid="ranking-row" className="ranking-row">
      <div className="ranking-media">
        <span className="ranking-rank" data-testid="ranking-rank">
          {entry.rank ?? '—'}
        </span>
        <div className="results-media">
          <ImageCarousel
            media={entry.contestant.media}
            onTap={() => {}}
            ariaLabel={`${entry.contestant.name}'s photos — swipe or use the arrows to browse`}
          />
        </div>
      </div>
      <div className="ranking-content">
        <span className="results-name">{entry.contestant.name}</span>
        {detail && <BioSnippet bio={detail.bio} />}
        {detail && <ContestantAttributes attributes={detail.attributes} />}
      </div>
      <div className="ranking-stats">
        <div className="ranking-stat">
          <span className="ranking-stat-label">Wins</span>
          <span data-testid="ranking-wins">{entry.wins}</span>
        </div>
        <div className="ranking-stat">
          <span className="ranking-stat-label">Appear.</span>
          <span data-testid="ranking-appearances">{entry.appearances}</span>
        </div>
        <div className="win-bar-track">
          <div className="win-bar-fill" style={{ width: `${winShare(entry.wins, maxWins)}%` }} />
        </div>
      </div>
    </li>
  )
}
