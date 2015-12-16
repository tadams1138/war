using System.Collections.Generic;
using System.Threading.Tasks;

namespace War.RankingServices
{
    public interface IRankingService
    {
        Task<IEnumerable<ContestantWithScore>> GetRankings(int warId);
    }
}
