// Sort/search/pagination controls shared by Home and MyWars, driven by
// useWarListPage. Split from the page components so neither Home.tsx nor
// MyWars.tsx repeats this JSX.
import type { UseWarListPageResult, WarListSort } from '../hooks/useWarListPage'

const SORT_OPTIONS: { value: WarListSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'expiring_soonest', label: 'Expiring Soonest' },
  { value: 'alphabetical', label: 'Alphabetical' },
]

export function WarListControls({ listPage }: { listPage: UseWarListPageResult }) {
  return (
    <div className="war-list-controls">
      <label>
        Sort
        <select
          data-testid="war-sort-select"
          value={listPage.sort}
          onChange={(event) => listPage.setSort(event.target.value as WarListSort)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Search
        <input
          type="search"
          data-testid="war-search-input"
          value={listPage.searchText}
          onChange={(event) => listPage.setSearchText(event.target.value)}
          placeholder="Search Wars"
        />
      </label>
    </div>
  )
}

export function WarListPagination({ listPage }: { listPage: UseWarListPageResult }) {
  return (
    <div className="war-list-pagination">
      <button type="button" data-testid="war-prev-button" onClick={listPage.goPrev} disabled={!listPage.hasPrev}>
        Prev
      </button>
      <button type="button" data-testid="war-next-button" onClick={listPage.goNext} disabled={!listPage.hasNext}>
        Next
      </button>
    </div>
  )
}
