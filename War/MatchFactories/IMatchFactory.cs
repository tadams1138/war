using System.Threading.Tasks;

namespace War.MatchFactories
{
    public interface IMatchFactory
    {
        Task<MatchWithContestants> Create(int warId);
    }
}
