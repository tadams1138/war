// Custom Cucumber parameter types shared by every feature. Imported by
// fixtures.ts so they are registered before any step file is read.
import { defineParameterType } from 'playwright-bdd'
import { BIO_PATTERN, bioFrom, type BioRef } from '../support/bios'
import { CALLS, type CallRef } from '../support/calls'
import { CARD_PATTERN, cardFrom, type CardRef } from '../support/cards'
import { FIELDS, type FieldRef } from '../support/fields'
import { LISTS, type ListRef } from '../support/lists'
import { PAGES, literalPage, type PageRef } from '../support/pageNames'
import { PROVIDERS, type Provider } from '../support/providers'
import { ROLES, type RoleFlags } from '../support/roles'
import { SCREENS, SIDES, type Side } from '../support/screens'

const names = Object.keys(PAGES).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

// {page}: a page by its name in PAGES ("Home", "that War's Edit page"), or a
// quoted literal path ("/wars/new").
defineParameterType({
  name: 'page',
  regexp: new RegExp(`${names.join('|')}|"[^"]*"`),
  transformer: (text: string): PageRef => PAGES[text] ?? literalPage(text.slice(1, -1)),
})

// {screen}: a screen size by its name in SCREENS ("phone", "desktop").
defineParameterType({
  name: 'screen',
  regexp: new RegExp(Object.keys(SCREENS).join('|')),
  transformer: (text: string) => SCREENS[text],
})

// {side}: which contestant of the matchup.
defineParameterType({
  name: 'side',
  regexp: new RegExp(SIDES.join('|')),
  transformer: (text: string): Side => text as Side,
})

// {card}: a contestant's card ("the left contestant's card", "the result of "Ada"").
defineParameterType({ name: 'card', regexp: CARD_PATTERN, transformer: (text: string): CardRef => cardFrom(text) })

// {bio}: a rendered bio ("the bio preview", "the bio of "Ada"").
defineParameterType({ name: 'bio', regexp: BIO_PATTERN, transformer: (text: string): BioRef => bioFrom(text) })

// {provider}: a sign-in provider by its label ("Google", "X").
defineParameterType({
  name: 'provider',
  regexp: new RegExp(PROVIDERS.map((provider) => provider.label).join('|')),
  transformer: (text: string): Provider => PROVIDERS.find((provider) => provider.label === text)!,
})

// {role}: who is signed in, by their name in ROLES ("voter", "Moderator", "Admin").
defineParameterType({
  name: 'role',
  regexp: new RegExp(Object.keys(ROLES).join('|')),
  transformer: (text: string): RoleFlags => ROLES[text],
})

// {list}: a Staff list or paged section by its name in LISTS ("the Wars list").
defineParameterType({
  name: 'list',
  regexp: new RegExp(Object.keys(LISTS).join('|')),
  transformer: (text: string): ListRef => LISTS[text]!,
})

const escaped = (names: string[]) => names.sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')

// {call}: an API call by its name in CALLS ("remove that War"). A call about
// one contestant ends with its name in quotes: 'remove the contestant "Ada"'.
defineParameterType({
  name: 'call',
  regexp: new RegExp(`(?:${escaped(Object.keys(CALLS))})(?: "[^"]*")?`),
  transformer: (text: string): CallRef => {
    const [, name, subject] = /^(.*?)(?: "([^"]*)")?$/.exec(text)!
    return { ...CALLS[name!]!, subject: subject ?? '' }
  },
})

// {field}: a form field by its name in FIELDS ("title", "contestant's bio").
defineParameterType({
  name: 'field',
  regexp: new RegExp(escaped(Object.keys(FIELDS))),
  transformer: (text: string): FieldRef => FIELDS[text]!,
})

// {status}: a War's status.
defineParameterType({
  name: 'status',
  regexp: /draft|published|closed/,
  transformer: (text: string) => text as 'draft' | 'published' | 'closed',
})

// {state}: a switch's state, as whether it is enabled.
defineParameterType({
  name: 'state',
  regexp: /on|off/,
  transformer: (text: string) => text === 'on',
})
