using System.Collections.Generic;

namespace War.RankingServices
{
    public interface IRankingService
    {
        IEnumerable<ContestantWithScore> GetRankings(int warId);
    }
}
