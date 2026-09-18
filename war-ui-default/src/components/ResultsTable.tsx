// The merged War detail results list (war-spec.md 10.1, 10.4): one row per
// contestant, ordered exactly as the rankings API returns it (never
// re-sorted), each carrying that contestant's browsable media, name, bio,
// and declared attributes alongside its rank/wins/appearances. Replaces
// what used to be two separate sections — a contestant gallery driven by
// GET /wars/:id and a leaderboard driven by GET /wars/:id/rankings.
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

export function ResultsTable({ rankings, contestants }: ResultsTableProps) {
  const detailsById = contestantDetailsById(contestants)
  return (
    <table data-testid="rankings-table" className="rankings-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Image</th>
          <th>Contestant</th>
          <th>Wins</th>
          <th>Appearances</th>
        </tr>
      </thead>
      <tbody>
        {rankings.map((entry) => (
          <ResultsRow key={entry.contestant.id} entry={entry} detail={detailsById.get(entry.contestant.id)} />
        ))}
      </tbody>
    </table>
  )
}

function ResultsRow({ entry, detail }: { entry: RankingEntry; detail: ContestantDetail | undefined }) {
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
    </tr>
  )
}
