using Microsoft.VisualStudio.TestTools.UnitTesting;
using FluentAssertions;
using System.Web.Http.Results;

namespace WarApi.Redirect
{
    [TestClass]
    public class RedirectControllerTests
    {
        [TestMethod]
        public void GivenUrl_Get_ReturnsRedirect()
        {
            // Arrange
            var controller = new RedirectController();
            var uri = "https://tes.turi.xyz/something.something?somethingelse=something";

            // Act
            var result = controller.Get(uri);

            // Assert
            result.Should().BeOfType<RedirectResult>();
            ((RedirectResult)result).Location.ToString().Should().Be(uri);
        }
    }
}