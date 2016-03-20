using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;

namespace WarApi
{
    [TestClass]
    public class WarControllerSanityTests
    {
        [TestMethod]
        [TestCategory("Sanity")]
        public async Task Contestants_ReturnsOK()
        {
            var principal = TestHelper.CreateStubUnauthenticatedClaimsPrincipal();
            var request = CreateRequest(HttpMethod.Get, "api/War/2/Contestants");
            var responseVerification = CreateResponseVerification(HttpStatusCode.OK);

            await TestHelper.TestEndpoint(request, principal, responseVerification);
        }

        [TestMethod]
        [TestCategory("Sanity")]
        public async Task Contestants_ReturnsBadRequest()
        {
            var principal = TestHelper.CreateStubUnauthenticatedClaimsPrincipal();
            var request = CreateRequest(HttpMethod.Post, "api/War/2/Contestants/Search");
            var responseVerification = CreateResponseVerification(HttpStatusCode.BadRequest);

            await TestHelper.TestEndpoint(request, principal, responseVerification);
        }

        [TestMethod]
        [TestCategory("Sanity")]
        public async Task GivenUnauthenticatedUser_SecuredEndpoints_ReturnUnauthorized()
        {
            var requests = new[] {
                CreateRequest(HttpMethod.Post, "api/War/2/Vote"),
                CreateRequest(HttpMethod.Post, "api/War/2/CreateMatch")
            };

            var tasks = requests.Select(VerifyUnauthorizedReturned);
            await Task.WhenAll(tasks);
        }

        private static async Task VerifyUnauthorizedReturned(HttpRequestMessage request)
        {
            var principal = TestHelper.CreateStubUnauthenticatedClaimsPrincipal();
            var responseVerification = CreateResponseVerification(HttpStatusCode.Unauthorized);

            await TestHelper.TestEndpoint(request, principal, responseVerification);
        }

        private static HttpRequestMessage CreateRequest(HttpMethod httpMethod, string relativeUrl)
        {
            var requestUri = TestHelper.CreateRelativeUri(relativeUrl);
            var request = new HttpRequestMessage
            {
                RequestUri = requestUri,
                Method = httpMethod
            };
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            return request;
        }

        private static Func<HttpResponseMessage, Task> CreateResponseVerification(HttpStatusCode expectedStatusCode)
        {
            return response =>
            {
                response.StatusCode.Should().Be(expectedStatusCode);
                return Task.FromResult(0);
            };
        }
    }
}