using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using System.Web.Http;

namespace WarApi.Tests.Controllers
{
    [TestClass]
    public class WarControllerSanityTests
    {
        [TestMethod]
        [TestCategory("Integration")]
        public async Task Contestants_SmokeTest()
        {
            var request = new HttpRequestMessage
            {
                RequestUri = CreateRelativeUri("api/War/1/Contestants"),
                Method = HttpMethod.Get
            };
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            Func<HttpResponseMessage, Task> responseVerification = async (response) =>
            {
                var content = response.Content;
                if (content != null)
                {
                    var contentAsString = await content.ReadAsStringAsync();
                    Console.WriteLine(contentAsString);
                }
                response.StatusCode.Should().Be(HttpStatusCode.OK);
            };

            await TestEndpoint(request, responseVerification);
        }

        private static async Task TestEndpoint(HttpRequestMessage request, Func<HttpResponseMessage, Task> verifyResponse)
        {
            using (var httpRequestMessage = request)
            using (var config = CreateHttpConfig())
            using (var server = CreateServer(config))
            using (var client = new HttpClient(server))
            using (var response = await client.SendAsync(request))
            {
                await verifyResponse(response);
            }
        }

        private static HttpServer CreateServer(HttpConfiguration config)
        {
            var server = new HttpServer(config);
            return server;
        }

        private static HttpConfiguration CreateHttpConfig()
        {
            var config = new HttpConfiguration();
            WebApiConfig.Register(config);
            config.IncludeErrorDetailPolicy = IncludeErrorDetailPolicy.Always;
            return config;
        }

        private static Uri CreateRelativeUri(string url)
        {
            string _url = "http://warserver/";
            var uri = new Uri(_url + url);
            return uri;
        }
    }
}
