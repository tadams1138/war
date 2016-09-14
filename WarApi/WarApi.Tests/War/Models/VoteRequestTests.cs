using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;

namespace WarApi.Models
{
    [TestClass]
    public class VoteRequestTests
    {
        [TestMethod]
        public void GivenChoice_Validate_ReturnsValidationResultIfNecessary()
        {
            ShouldFailValidation(new VoteRequest(), nameof(VoteRequest.Choice));
            ShouldPassValidation(new VoteRequest { Choice = VoteChoice.Contestant2 }, nameof(VoteRequest.Choice));
        }

        private void ShouldFailValidation(VoteRequest voteRequest, string propertyName)
        {
            var result = ValidateModel(voteRequest);
            result.Should().Contain(x => x.MemberNames.Contains($"{propertyName}"));
        }

        private void ShouldPassValidation(VoteRequest voteRequest, string propertyName)
        {
            var result = ValidateModel(voteRequest);
            result.Should().NotContain(x => x.MemberNames.Contains($"{propertyName}"));
        }

        private IList<ValidationResult> ValidateModel(object model)
        {
            var validationResults = new List<ValidationResult>();
            var ctx = new ValidationContext(model, null, null);
            Validator.TryValidateObject(model, ctx, validationResults, true);
            return validationResults;
        }
    }
}