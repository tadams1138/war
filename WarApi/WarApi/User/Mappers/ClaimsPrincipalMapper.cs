using System.Security.Claims;
using WarApi.Mappers;

namespace WarApi.User.Mappers
{
    public class ClaimsPrincipalMapper : ITypedMapper<ClaimsPrincipal, Models.User>
    {
        public Models.User Map(ClaimsPrincipal source)
        {
            string name = source.Identity.Name;
            var target = new Models.User
            {
                Name = name
            };
            return target;
        }
    }
}
