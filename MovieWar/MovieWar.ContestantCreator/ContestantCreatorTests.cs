using System.IO;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json;
using FluentAssertions;
using System.Threading.Tasks;
using System.Collections.Generic;
using War.Contestants.Sql;

namespace MovieWar.ContestantCreator
{
    [TestClass]
    public class ContestantCreatorTests
    {
        [Ignore]
        [TestMethod]
        public async Task GivenMovieIdentifiers_Create_ReturnsContestantRequests()
        {
            // Arrange
            var items = GetMovieIdentifiersFromFile();
            var factory = new OmdbApiMovieContestantRequestFactory();

            // Act
            var contestants = await factory.Create(items);

            // Assert
            contestants.Should().NotBeNullOrEmpty();
            await FileContestantRequestFactory.WriteMovieContestantsToFile(contestants);
        }

        private static MovieIdentifier[] GetMovieIdentifiers()
        {
            return new MovieIdentifier[]
            {
                new MovieIdentifier
                {
                    Title = "Star Wars",
                    Year = 1977
                },
                new MovieIdentifier
                {
                    Title = "The Empire Strikes Back",
                    Year = 1980
                },
                new MovieIdentifier
                {
                    Title = "Return of the Jedi",
                    Year = 1983
                }
            };
        }

        private static MovieIdentifier[] GetMovieIdentifiersFromFile()
        {
            MovieIdentifier[] items = null;
            using (var r = new StreamReader("MovieIdentifiers.json"))
            {
                string json = r.ReadToEnd();
                items = JsonConvert.DeserializeObject<MovieIdentifier[]>(json);
            }

            return items;
        }
    }
}
