using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using System.Security.Claims;
using WarApi.Mappers;

namespace WarApi.User
{
    [TestClass()]
    public class UserControllerTests
    {
        [TestMethod()]
        public void GivenClaimsPrincipal_Get_ReturnsUser()
        {
            // Arrange
            var stubClaimsPrincipal = new ClaimsPrincipal();
            var _stubUser = new Models.User();
            var _stubMapper = new Mock<IMapper>();
            _stubMapper.Setup(x => x.Map<ClaimsPrincipal, Models.User>(stubClaimsPrincipal)).Returns(_stubUser);
            var _controller = new UserController(_stubMapper.Object)
            {
                User = stubClaimsPrincipal
            };

            // Act
            var result = _controller.Get();

            // Assert
            result.Should().Be(_stubUser);
        }
    }
}