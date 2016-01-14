using System.Threading.Tasks;
using System.Web.Http;
using WarApi.Models;

namespace WarApi.Controllers
{
    public interface IWarController
    {
        Task<IHttpActionResult> CreateMatch(int warId);
        Task<IHttpActionResult> GetContestants(int warId);
        Task<IHttpActionResult> Vote(int warId, VoteRequest request);
    }
}