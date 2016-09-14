using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json;
using System;
using System.Threading.Tasks;

namespace MovieWar.ContestantCreator
{
    [TestClass]
    public class MovieIdFactoryTests
    {
        [Ignore]
        [TestMethod]
        public async Task GivenRangeOfYear_GetMovieIds_ReturnsMovieIds()
        {
            // Arrange
            var factory = new WikipediaTopGrossingMoviesMovieIdFactory();

            // Act
            var results = await factory.GetMovieIds(1929, 2015);

            // Assert
            results.Should().NotBeNullOrEmpty();
            var jsonResults = JsonConvert.SerializeObject(results);
            Console.WriteLine(jsonResults);
        }
    }
}
