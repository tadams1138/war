using System.Web.Http;
using System.Web.Http.Cors;

namespace WarApi.Redirect
{
    /// <summary>
    /// Redirects to another Uri.
    /// </summary>
    [EnableCors(origins: "*", headers: "*", methods: "*", SupportsCredentials = true)]
    [RoutePrefix("api/Redirect")]
    [Authorize]
    public class RedirectController : ApiController
    {
        /// <summary>
        /// Redirects to another Uri.
        /// </summary>
        /// <param name="uri">The Uri to redirect to.</param>
        /// <returns>A redirect.</returns>
        public IHttpActionResult Get(string uri)
        {
            return Redirect(uri);
        }
    }
}
