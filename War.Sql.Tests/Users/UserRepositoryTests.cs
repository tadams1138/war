using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Threading.Tasks;
using War.Sql.Tests.Properties;

namespace War.Sql
{
    [TestClass]
    public class UserRepositoryTests
    {
        private UserRepository _repository;
        private UserIdentifier _userIdentifier;

        [TestMethod]
        [TestCategory("Integration")]
        public async Task UpsertTest()
        {
            _repository = new UserRepository(Settings.Default.WarDb);
            _userIdentifier = new UserIdentifier { AuthenticationType = "test Authentication", NameIdentifier = "test NameIdentifier" };
            
            await VerifyInsertWorks();
            await VerifyUpdateWorks();
            await Cleanup();
        }

        private async Task Cleanup()
        {
            await _repository.Delete(_userIdentifier);
            var thirdGetResult = await _repository.Get(_userIdentifier);
            thirdGetResult.Should().BeNull();
        }

        private async Task VerifyUpdateWorks()
        {
            var updatedUser = new User { Id = _userIdentifier, Name = "new Name" };
            await VerifyUpsertWorks(updatedUser);
        }

        private async Task VerifyInsertWorks()
        {
            var newUser = new User { Id = _userIdentifier, Name = "test Name" };
            await VerifyUpsertWorks(newUser);
        }

        private async Task VerifyUpsertWorks(User user)
        {
            await _repository.Upsert(user);
            var getResult = await _repository.Get(_userIdentifier);
            VerifyUsersAreTheSame(user, getResult);
        }

        private static void VerifyUsersAreTheSame(User source, User target)
        {
            target.Name.Should().Be(source.Name);
            target.Id.AuthenticationType.Should().Be(source.Id.AuthenticationType);
            target.Id.NameIdentifier.Should().Be(source.Id.NameIdentifier);
        }
    }
}