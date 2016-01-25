using System.Threading.Tasks;

namespace War.Users
{
    public interface IUserRepository
    {
        Task Upsert(User user);
    }
}
