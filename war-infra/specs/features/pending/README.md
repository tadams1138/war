# Pending feature files

`routing.feature` — 27 scenarios asserting observable edge and routing behaviour, moved
here when Gherkin was removed from `specs/war-infra-spec.md`. They contain no vendor
names and stay valid across a provider change.

There is no runner. `war-infra` is Terraform and workflows, with no test project, so
nothing executes these today. They are the specification of behaviour that would
otherwise only be verifiable by hand against a live environment.
