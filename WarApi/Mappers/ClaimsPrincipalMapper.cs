using System.Security.Claims;
using War;

namespace WarApi.Mappers
{
    class ClaimsPrincipalMapper : ITypedMapper<ClaimsPrincipal, User>
    {
        public User Map(ClaimsPrincipal source)
        {
            string nameIdentifier = source.FindFirst(ClaimTypes.NameIdentifier).Value;
            string authenticationType = source.Identity.AuthenticationType;
            string name = source.Identity.Name;
            var target = new User
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
