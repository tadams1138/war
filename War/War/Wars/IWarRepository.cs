using System.Threading.Tasks;

namespace War.Wars
{
    public interface IWarRepository
    {
        Task<War> Get(int id);
    }
}
