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

        /// <summary>
        /// Get information about the authenticated user.
        /// </summary>
        /// <returns>User information.</returns>
        public Models.User Get()
        {
            var user = _mapper.Map<ClaimsPrincipal, Models.User>(User as ClaimsPrincipal);
            return user;
        }
    }
}
