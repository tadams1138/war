// Custom Cucumber parameter types shared by every feature. Imported by
// fixtures.ts so they are registered before any step file is read.
import { defineParameterType } from 'playwright-bdd'
import { PAGES, literalPage, type PageRef } from '../support/pageNames'
import { PROVIDERS, type Provider } from '../support/providers'
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

// {provider}: a sign-in provider by its label ("Google", "X").
defineParameterType({
  name: 'provider',
  regexp: new RegExp(PROVIDERS.map((provider) => provider.label).join('|')),
  transformer: (text: string): Provider => PROVIDERS.find((provider) => provider.label === text)!,
})
