using System.Security.Claims;
using War.Users;

namespace WarApi.Mappers
{
    class ClaimsPrincipalMapper : ITypedMapper<ClaimsPrincipal, War.Users.User>
    {
        public War.Users.User Map(ClaimsPrincipal source)
        {
            string nameIdentifier = source.FindFirst(ClaimTypes.NameIdentifier).Value;
            string authenticationType = source.Identity.AuthenticationType;
            string name = source.Identity.Name;
            var target = new War.Users.User
            {
                Id = new UserIdentifier
                {
                    AuthenticationType = authenticationType,
                    NameIdentifier = nameIdentifier
                },
                Name = name
            };
            return target;
        }
    }
}
