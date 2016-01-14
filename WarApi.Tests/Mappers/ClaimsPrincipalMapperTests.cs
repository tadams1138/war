using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Security.Claims;
using Moq;
using War;
using FluentAssertions;
using System.Security.Principal;

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
            var source = new Mock<ClaimsPrincipal>();
            var identity = new Mock<IIdentity>();
            identity.Setup(x => x.Name).Returns(name);
            identity.Setup(x => x.AuthenticationType).Returns(authenticationType);
            source.Setup(x => x.Identity).Returns(identity.Object);
            var nameIdentifierClaim = new Claim("test Type", nameIdentifier);
            source.Setup(x => x.FindFirst(ClaimTypes.NameIdentifier)).Returns(nameIdentifierClaim);

            // Act
            var target = mapper.Map<ClaimsPrincipal, User>(source.Object);

            // Assert
            target.Name.Should().Be(name);
            target.Id.AuthenticationType.Should().Be(authenticationType);
            target.Id.NameIdentifier.Should().Be(nameIdentifier);
        }
    }
}
