// The War creation wizard (the spec). Each step
// calls the API immediately -- the state machine driving that lives in
// useCreateWarWizard; this component is rendering only, mirroring
// VoteMode/useVoteSession's split.
import { useNavigate } from 'react-router-dom'
import type { WarSummary } from '../api/client'
import { ContestantsStepView } from '../createWar/ContestantsStep'
import { MetadataStepView } from '../createWar/MetadataStep'
import { ReviewStepView } from '../createWar/ReviewStep'
import { useCreateWarWizard } from '../createWar/useCreateWarWizard'

export function CreateWar() {
  const navigate = useNavigate()
  const onActivated = (war: WarSummary) => navigate(`/wars/${war.id}/vote`)
  const { state, submitMetadata, submitContestant, attachImages, proceedToReview, activate } = useCreateWarWizard(onActivated)

  if (state.step === 'metadata') return <MetadataStepView state={state} onSubmit={submitMetadata} />
  if (state.step === 'contestants') {
    return (
      <ContestantsStepView
        state={state}
        onAddContestant={submitContestant}
        onAttachImages={attachImages}
        onContinue={proceedToReview}
      />
    )
  }
  return <ReviewStepView state={state} onActivate={activate} />
}
