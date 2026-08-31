// Displays voted/total matchups as a percentage bar and text label
// (war-ui-default-spec.md §6). `total` is every pair in the War, so
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
      <div style={{ width: '100%', background: '#e5e7eb', borderRadius: 9999, height: 8 }}>
        <div style={{ width: `${percent}%`, background: '#4f46e5', borderRadius: 9999, height: 8 }} />
      </div>
      <p>
        {voted} of {total} matchups
      </p>
    </div>
  )
}
