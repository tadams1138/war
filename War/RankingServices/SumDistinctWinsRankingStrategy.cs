using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using War.Contestants;
using War.Matches;
using War.Votes;

namespace War.RankingServices
{
    public class SumDistinctWinsRankingStrategy : IRankingService
    {
        private readonly IContestantRepository _contestantRepository;
        private readonly IMatchRepository _matchRepository;
        private readonly IVoteRepository _voteRepository;

        public SumDistinctWinsRankingStrategy(IMatchRepository matchRepository, IContestantRepository constestantRepository, IVoteRepository voteRepository)
        {
            _matchRepository = matchRepository;
            _contestantRepository = constestantRepository;
            _voteRepository = voteRepository;
        }
        public async Task<IEnumerable<ContestantWithScore>> GetRankings(int warId)
        {
            var contestants = await _contestantRepository.GetAll(warId);
            var matches = await _matchRepository.GetAll(warId);
            var votes = await _voteRepository.GetAll(warId);

            var scores = (from v in votes.Where(v => v.Choice != VoteChoice.Pass)
                         from m in matches.Where(m => m.Id == v.MatchId)
                         select (v.Choice == VoteChoice.Contestant1Won ? m.Contestant1 : m.Contestant2))
                         .GroupBy(x => x)
                         .Select(group => new { Id = group.Key, Score = group.Count() });

            var results = from c in contestants
                         from s in scores.Where(s => s.Id == c.Id).DefaultIfEmpty()
                         select new ContestantWithScore
                         {
                             Contestant = c,
                             Score = s == null ? 0 : s.Score
                         };
            return results;
        }
    }
}