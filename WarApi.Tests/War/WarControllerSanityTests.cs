using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System;
using System.Collections.Generic;
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
        [TestCategory("Smoke")]
        public async Task Contestants_ReturnsOK()
        {
            var principal = TestHelper.CreateStubUnauthenticatedClaimsPrincipal();
            var request = CreateRequest(HttpMethod.Get, "api/War/2/Contestants");
            var responseVerification = CreateResponseVerification(HttpStatusCode.OK);

            await TestHelper.TestEndpoint(request, principal, responseVerification);
        }

        [TestMethod]
        [TestCategory("Smoke")]
        public async Task GivenUnauthenticatedUser_Contestants_ReturnsUnauthorized()
        {
            var requests = new[] {
                CreateRequest(HttpMethod.Post, "api/War/2/Vote"),
                CreateRequest(HttpMethod.Post, "api/War/2/CreateMatch")
            };

            var tasks = new List<Task>();
            foreach (var r in requests)
            {
                var task = VerifyUnauthorizedReturned(r);
                tasks.Add(task);
            }

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
            var request = new HttpRequestMessage
            {
                RequestUri = TestHelper.CreateRelativeUri(relativeUrl),
                Method = httpMethod
            };
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            return request;
        }
        
        private static Func<HttpResponseMessage, Task> CreateResponseVerification(HttpStatusCode expectedStatusCode)
        {
            return (response) =>
            {
                response.StatusCode.Should().Be(expectedStatusCode);
                return Task.FromResult(0);
            };
        }
    }
}
