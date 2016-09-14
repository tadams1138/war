using Microsoft.VisualStudio.TestTools.UnitTesting;
using WarApi.Mappers;
using System.Security.Claims;
using FluentAssertions;

namespace WarApi.User.Mappers
{
    [TestClass]
    public class ClaimsPrincipalMapperTests
    {
        [TestMethod]
        public void GivenPrincipal_Map_ReturnsUser()
        {
            // Arrange
            const string name = "test Name";
            const string authenticationType = "test authenticationType";
            const string nameIdentifier = "test nameIdentifier";
            var mapper = new Mapper();
            var source = TestHelper.CreateStubClaimsPrincipal(name, authenticationType, nameIdentifier);

            // Act
            var target = mapper.Map<ClaimsPrincipal, Models.User>(source);

            // Assert
            target.Name.Should().Be(name);
        }
    }
}