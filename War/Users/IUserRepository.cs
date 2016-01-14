using System.Threading.Tasks;

namespace War
{
    public interface IUserRepository
    {
        Task Upsert(User user);
    }
}
