using System.Threading.Tasks;

namespace War
{
    public interface IWarRepository
    {
        Task<War> Get(int id);
    }
}
