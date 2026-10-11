// The contestant cards Gherkin steps name with the {card} parameter type
// (steps/parameters.ts): a matchup's card by its side ("the left contestant's
// card"), or a result in the War detail's results list ("the result of
// "Ada""). Each knows where it is and which images it was given.
import type { Locator, Page } from '@playwright/test'
import type { MediaItem } from '../../../src/api/client'
import type { World } from '../steps/fixtures'
import { contestantNamed, warDetail } from './editWar'
import { matchupCard, resultRow } from './pages'
import type { Side } from './screens'

export interface CardRef {
  locator: (page: Page) => Locator
  // The images it was given, in the order they were given.
  media: (world: World) => MediaItem[]
}

export const CARD_PATTERN = /the (?:left|right) contestant's card|the result of "[^"]*"/

export function cardFrom(text: string): CardRef {
  const result = /^the result of "(.*)"$/.exec(text)
  if (result) {
    const name = result[1]!
    return { locator: (page) => resultRow(page, name), media: (world) => contestantNamed(warDetail(world), name).media }
  }
  const side = /(left|right)/.exec(text)![1] as Side
  return { locator: (page) => matchupCard(page, side), media: (world) => world.matchup![side].media }
}
