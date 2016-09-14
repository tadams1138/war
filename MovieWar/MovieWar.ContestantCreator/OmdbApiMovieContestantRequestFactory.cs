using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using War.Contestants.Sql;

namespace MovieWar.ContestantCreator
{
    internal class OmdbApiMovieContestantRequestFactory
    {
        internal async Task<IEnumerable<ContestantRequest>> Create(IEnumerable<MovieIdentifier> movieIds)
        {
            var contestants = new List<ContestantRequest>();
            var failures = new List<MovieIdentifier>();
            foreach (var m in movieIds)
            {
                var movieContestant = await GetContestantFromOmdbApi(m);
                if (movieContestant.Definition.ContainsKey("Error"))
                {
                    failures.Add(m);
                }
                else if (movieContestant.Definition["Poster"] != null)
                {
                    contestants.Add(movieContestant);
                }
            }

            if (failures.Any())
            {
                var s = new StringBuilder("Failed to get the following movies:" + Environment.NewLine);
                foreach (var f in failures)
                {
                    s.AppendLine($"{f.Title} ({f.Year})");
                }
                throw new Exception(s.ToString());
            }

            return contestants;
        }

        private static async Task<ContestantRequest> GetContestantFromOmdbApi(MovieIdentifier m)
        {
            try
            {
                using (var client = CreateClient())
                {
                    var requestUri = await CreateRequestUri(m);
                    var response = await client.GetAsync(requestUri);
                    response.EnsureSuccessStatusCode();
                    var movieContestant = await CreateContestant(response);
                    return movieContestant;
                }
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to get contestant info for movie {m.Title} ({m.Year}).", ex);
            }
        }

        private static async Task<ContestantRequest> CreateContestant(HttpResponseMessage response)
        {
            var movie = await response.Content.ReadAsAsync<Dictionary<string, string>>();
            ScrubBadValues(movie);
            var movieContestant = new ContestantRequest
            {
                Definition = movie
            };
            return movieContestant;
        }

        private static void ScrubBadValues(Dictionary<string, string> movie)
        {
            var keys = new List<string>(movie.Keys);
            foreach (var k in keys)
            {
                if (movie[k] == "N/A")
                {
                    movie[k] = null;
                }
            }
        }

        private static async Task<string> CreateRequestUri(MovieIdentifier m)
        {
            var values = new Dictionary<string, string>
                    {
                        { "t", m.Title },
                        { "y", m.Year.ToString() },
                        { "plot", "short" },
                        { "r", "json" },
                        { "type", "movie" }
                    };

            string query;
            using (var content = new FormUrlEncodedContent(values))
            {
                query = await content.ReadAsStringAsync();
            }
            var requestUri = "?" + query;
            return requestUri;
        }

        private static HttpClient CreateClient()
        {
            var baseAddress = new Uri("http://www.omdbapi.com");
            var client = new HttpClient
            {
                BaseAddress = baseAddress
            };
            return client;
        }
    }
}