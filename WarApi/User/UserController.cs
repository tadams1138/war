using System.Security.Claims;
using System.Web.Http;
using System.Web.Http.Cors;
using WarApi.Mappers;

namespace WarApi.User
{
    /// <summary>
    /// User endpoints give you information about the authenticated user.
    /// </summary>
    [EnableCors(origins: "*", headers: "*", methods: "*", SupportsCredentials = true)]
    [RoutePrefix("api/User")]
    [Authorize]
    public class UserController : ApiController
    {
        private IMapper _mapper;

        public UserController(IMapper mapper)
        {
            _mapper = mapper;
        }

        public User.Models.User Get()
        {
            var user = _mapper.Map<ClaimsPrincipal, User.Models.User>(User as ClaimsPrincipal);
            return user;
        }
    }
}
