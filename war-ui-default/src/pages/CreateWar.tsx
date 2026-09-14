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
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'

export function CreateWar() {
  const navigate = useNavigate()
  const onActivated = (war: WarSummary) => navigate(`/wars/${war.id}/vote`)
  const { state, submitMetadata, submitContestant, attachImages, proceedToReview, activate } = useCreateWarWizard(onActivated)
  const [theme, setTheme] = useTheme('home', 'arcade')
  usePublishTheme('home', theme, setTheme)

  if (state.step === 'metadata') return <MetadataStepView state={state} onSubmit={submitMetadata} theme={theme} />
  if (state.step === 'contestants') {
    return (
      <ContestantsStepView
        state={state}
        onAddContestant={submitContestant}
        onAttachImages={attachImages}
        onContinue={proceedToReview}
        theme={theme}
      />
    )
  }
  return <ReviewStepView state={state} onActivate={activate} theme={theme} />
}
