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

            var winners = from v in votes
                          join m in matches on v.MatchId equals m.Id
                          where v.Choice != VoteChoice.Pass                                                
                          select (v.Choice == VoteChoice.Contestant1Won ? m.Contestant1 : m.Contestant2);

            var scores = from w in winners
                         group w by w into g
                         select new { Id = g.Key, Score = g.Count() };

            var results = from c in contestants
                          join s in scores on c.Id equals s.Id into scoredGroup
                          from score in scoredGroup.DefaultIfEmpty()
                          select new ContestantWithScore
                          {
                              Contestant = c,
                              Score = score == null ? 0 : score.Score
                          };
            return results;
        }
    }
}