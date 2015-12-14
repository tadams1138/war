using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Threading.Tasks;
using War.Sql.Tests.Properties;

namespace War.Sql
{
    [TestClass()]
    public class WarRepositoryTests
    {
        [TestMethod()]
        [TestCategory("Integration")]
        public async Task WarRepository_CRD_Test()
        {
            var repository = new WarRepository(Settings.Default.WarDb);

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