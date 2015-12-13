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
            ValidateModel(new VoteRequest(), false);
            ValidateModel(new VoteRequest { Choice = VoteChoice.Contestant2 }, true);
        }

        private void ValidateModel(VoteRequest voteRequest, bool shouldBeValid)
        {
            var result = ValidateModel(voteRequest);
            if (shouldBeValid)
            {
                result.Should().NotContain(x => x.MemberNames.Contains($"{nameof(VoteRequest.Choice)}"));
            }
            else
            {
                result.Should().Contain(x => x.MemberNames.Contains($"{nameof(VoteRequest.Choice)}"));
            }
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