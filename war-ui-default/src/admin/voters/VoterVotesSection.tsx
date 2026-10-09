// A Voter's vote history as Staff see it (war-spec.md §6.7): each vote's War,
// winner, loser and cast time, newest first.
import { Link } from 'react-router-dom'
import { warTitle } from '../../utils/warTitle'
import { useVoterVotes } from './useVoterVotes'
import { ErrorMessage } from '../../components/ErrorMessage'
import { LoadingMessage } from '../../components/AsyncStatus'

export function VoterVotesSection({ voterId }: { voterId: string }) {
  const history = useVoterVotes(voterId)

  return (
    <section aria-labelledby="voter-votes-heading">
      <h2 id="voter-votes-heading">Votes</h2>
      {history.status === 'loading' && <LoadingMessage />}
      <ErrorMessage message={history.error} />
      {history.status === 'loaded' && (
        <>
          <ul>
            {history.votes.map((vote) => (
              <li key={vote.id} data-testid="admin-vote-row">
                <Link to={`/admin/wars/${vote.war_id}`}>{warTitle(vote.war_title)}</Link>
                <span>
                  {' '}
                  · <strong>{vote.winner_name}</strong> beat {vote.loser_name} ·{' '}
                </span>
                <time dateTime={vote.cast_at}>{new Date(vote.cast_at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
          {history.hasMore && (
            <button type="button" className="button" data-testid="admin-votes-load-more" disabled={history.loadingMore} onClick={history.loadMore}>
              Load more
            </button>
          )}
        </>
      )}
    </section>
  )
}
