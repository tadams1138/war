// Custom Cucumber parameter types shared by every feature. Imported by
// fixtures.ts so they are registered before any step file is read.
import { defineParameterType } from 'playwright-bdd'
import { PAGES, literalPage, type PageRef } from '../support/pageNames'

const names = Object.keys(PAGES).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

// {page}: a page by its name in PAGES ("Home", "that War's Edit page"), or a
// quoted literal path ("/wars/new").
defineParameterType({
  name: 'page',
  regexp: new RegExp(`${names.join('|')}|"[^"]*"`),
  transformer: (text: string): PageRef => PAGES[text] ?? literalPage(text.slice(1, -1)),
})
