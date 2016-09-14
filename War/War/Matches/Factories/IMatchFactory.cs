using System.Threading.Tasks;
using War.Users;

namespace War.Matches.Factories
{
    public interface IMatchFactory
    {
        Task<MatchWithContestants> Create(int warId, UserIdentifier userId);
    }
}
