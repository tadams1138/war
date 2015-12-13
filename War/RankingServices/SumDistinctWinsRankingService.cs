using System.Collections.Generic;
using System.Linq;

namespace War.RankingServices
{
    public class SumDistinctWinsRankingService : IRankingService
    {
        private readonly IContestantRepository _contestantRepository;
        private readonly IMatchRepository _matchRepository;

        public SumDistinctWinsRankingService(IMatchRepository matchRepository, IContestantRepository constestantRepository)
        {
            _matchRepository = matchRepository;
            _contestantRepository = constestantRepository;
        }
        public IEnumerable<ContestantWithScore> GetRankings(int warId)
        {
            var contestants = _contestantRepository.GetAll(warId);
            var matches = _matchRepository.GetAll(warId);

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
