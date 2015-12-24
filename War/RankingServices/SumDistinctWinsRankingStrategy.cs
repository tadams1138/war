using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace War.RankingServices
{
    public class SumDistinctWinsRankingStrategy : IRankingService
    {
        private readonly IContestantRepository _contestantRepository;
        private readonly IMatchRepository _matchRepository;

        public SumDistinctWinsRankingStrategy(IMatchRepository matchRepository, IContestantRepository constestantRepository)
        {
            _matchRepository = matchRepository;
            _contestantRepository = constestantRepository;
        }
        public async Task<IEnumerable<ContestantWithScore>> GetRankings(int warId)
        {
            var contestants = await _contestantRepository.GetAll(warId);
            var matches = await _matchRepository.GetAll(warId);

            var scores = matches
                .Where(x => x.Result == VoteChoice.Contestant1Won)
                .Select(x => x.Contestant1)
                .Concat(matches
                    .Where(x => x.Result == VoteChoice.Contestant2Won)
                    .Select(x => x.Contestant2))
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