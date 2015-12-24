using System.Collections.Generic;
using System.Threading.Tasks;

namespace War
{
    public interface IContestantRepository
    {
        Task<IEnumerable<Contestant>> GetAll(int warId);
        Task<int> GetCount(int warId);
        Task<Contestant> Get(int warId, int index);
    }
}
