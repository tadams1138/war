using Moq;
using System;
using System.Net.Http;
using System.Security.Claims;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Http;
using System.Web.Http.Filters;

namespace WarApi
{
    public static class TestHelper
    {
        public static ClaimsPrincipal CreateStubClaimsPrincipal(string name, string authenticationType, string nameIdentifier)
        {
            var identity = new Mock<IIdentity>();
            identity.Setup(x => x.Name).Returns(name);
            identity.Setup(x => x.AuthenticationType).Returns(authenticationType);
            identity.Setup(x => x.IsAuthenticated).Returns(true);
            var nameIdentifierClaim = new Claim("test Type", nameIdentifier);
            var stubClaimsPrincipal = CreateStubClaimsPrincipal(identity);
            stubClaimsPrincipal.Setup(x => x.FindFirst(ClaimTypes.NameIdentifier)).Returns(nameIdentifierClaim);
            return stubClaimsPrincipal.Object;
        }

        public static ClaimsPrincipal CreateStubUnauthenticatedClaimsPrincipal()
        {
            var identity = new Mock<IIdentity>();
            identity.Setup(x => x.IsAuthenticated).Returns(false);
            var stubClaimsPrincipal = CreateStubClaimsPrincipal(identity);
            return stubClaimsPrincipal.Object;
        }

        public static Uri CreateRelativeUri(string url)
        {
            var uri = new Uri("http://warserver/" + url);
            return uri;
        }

        public static async Task TestEndpoint(HttpRequestMessage request, IPrincipal principal, Func<HttpResponseMessage, Task> verifyResponse)
        {
            using (var config = CreateHttpConfig(principal))
            using (var server = CreateServer(config))
            using (var client = new HttpClient(server))
            using (var response = await client.SendAsync(request))
            {
                await WriteContentToConsole(response);
                await verifyResponse(response);
            }
        }

        private static async Task WriteContentToConsole(HttpResponseMessage response)
        {
            var content = response.Content;
            if (content != null)
            {
                var contentAsString = await content.ReadAsStringAsync();
                Console.WriteLine(contentAsString);
            }
        }

        private static Mock<ClaimsPrincipal> CreateStubClaimsPrincipal(Mock<IIdentity> identity)
        {
            var stubClaimsPrincipal = new Mock<ClaimsPrincipal>();
            stubClaimsPrincipal.Setup(x => x.Identity).Returns(identity.Object);
            return stubClaimsPrincipal;
        }

        private static HttpServer CreateServer(HttpConfiguration config)
        {
            var server = new HttpServer(config);
            return server;
        }

        private static HttpConfiguration CreateHttpConfig(IPrincipal principal)
        {
            var config = new HttpConfiguration();
            WebApiConfig.Register(config);
            AddAuthenticationFilter(principal, config);
            config.IncludeErrorDetailPolicy = IncludeErrorDetailPolicy.Always;
            return config;
        }

        private static void AddAuthenticationFilter(IPrincipal principal, HttpConfiguration config)
        {
            var stubAuthenticationFilter = new Mock<IAuthenticationFilter>();
            stubAuthenticationFilter
                .Setup(x => x.AuthenticateAsync(It.IsAny<HttpAuthenticationContext>(), It.IsAny<CancellationToken>()))
                .Callback<HttpAuthenticationContext, CancellationToken>(
                    (context, cancellationToken) => context.Principal = principal)
                .Returns(Task.CompletedTask);
            config.Filters.Add(stubAuthenticationFilter.Object);
        }
    }
}
