using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Threading.Tasks;

namespace War.Wars.Sql
{
    [TestClass()]
    public class WarRepositoryTests
    {
        [TestMethod()]
        [TestCategory("Integration")]
        public async Task WarRepository_CRD_Test()
        {
            var sqlServerConnectionString = System.Configuration.ConfigurationManager.ConnectionStrings["WarDb"].ConnectionString;
            var repository = new WarRepository(sqlServerConnectionString);

            var request = new WarRequest
            {
                Title = "test Title"
            };
            var id = await repository.Create(request);

            var retrieved = await repository.Get(id);
            retrieved.Should().NotBeNull();
            retrieved.Title.Should().Be(request.Title);

            await repository.Delete(id);
            retrieved = await repository.Get(id);
            retrieved.Should().BeNull();            
        }
    }
}