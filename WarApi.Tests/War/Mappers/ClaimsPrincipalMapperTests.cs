using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Security.Claims;
using FluentAssertions;

namespace WarApi.Mappers
{
    [TestClass]
    public class ClaimsPrincipalMapperTests
    {
        [TestMethod()]
        public void GivenClaimsPrincipal_Map_ReturnsUser()
        {
            // Arrange
            const string name = "test Name";
            const string authenticationType = "test authenticationType";
            const string nameIdentifier = "test nameIdentifier";
            var mapper = new Mapper();
            var source = TestHelper.CreateStubClaimsPrincipal(name, authenticationType, nameIdentifier);

            // Act
            var target = mapper.Map<ClaimsPrincipal, War.Users.User>(source);

            // Assert
            target.Name.Should().Be(name);
            target.Id.AuthenticationType.Should().Be(authenticationType);
            target.Id.NameIdentifier.Should().Be(nameIdentifier);
        }
    }
}
