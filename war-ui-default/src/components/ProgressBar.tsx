// Displays voted/total matchups as a percentage bar and text label
// (war-spec.md §6.3). `total` is every pair in the War, so
// finishing is not expected — copy frames this as contribution, never as
// an unfinished task.
interface ProgressBarProps {
  voted: number
  total: number
}

export function ProgressBar({ voted, total }: ProgressBarProps) {
  const percent = total > 0 ? Math.round((voted / total) * 100) : 0

  return (
    <div role="progressbar" aria-valuenow={voted} aria-valuemin={0} aria-valuemax={total}>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p>
        {voted} of {total} matchups
      </p>
    </div>
  )
}
