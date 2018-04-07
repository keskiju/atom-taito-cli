/** @babel */

/*
Copyright (c) 2014 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// This is a modified version of the command-palette-view.js.
// Modified parts are marked with 'atom-taito-cli'. Original file:
// https://github.com/atom/command-palette/blob/master/lib/command-palette-view.js

import SelectListView from 'atom-select-list';
import {humanizeKeystroke} from 'underscore-plus';
import fuzzaldrin from 'fuzzaldrin';
import fuzzaldrinPlus from 'fuzzaldrin-plus';

// atom-taito-cli
import { exec } from 'child_process';
const asyncExec = command => {
  return new Promise(function(resolve, reject) {
    exec(command, {
      cwd: atom.project.getPaths()[0]
    }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout.trim());
    });
  });
}

export default class AtomTaitoCliView {
  constructor (initiallyVisibleItemCount = 10) {
    this.keyBindingsForActiveElement = []
    this.selectListView = new SelectListView({
      initiallyVisibleItemCount: initiallyVisibleItemCount, // just for being able to disable visible-on-render in spec
      items: [],
      filter: this.filter,
      emptyMessage: 'No matches found',
      elementForItem: (item, {index, selected, visible}) => {
        if (!visible) {
          return document.createElement("li")
        }

        const li = document.createElement('li')
        li.classList.add('event', 'two-lines')
        li.dataset.eventName = item.name

        const rightBlock = document.createElement('div')
        rightBlock.classList.add('pull-right')

        this.keyBindingsForActiveElement
        .filter(({command}) => command === item.name)
        .forEach(keyBinding => {
          const kbd = document.createElement('kbd')
          kbd.classList.add('key-binding')
          kbd.textContent = humanizeKeystroke(keyBinding.keystrokes)
          rightBlock.appendChild(kbd)
        })
        li.appendChild(rightBlock)

        const leftBlock = document.createElement('div')
        const titleEl = document.createElement('div')
        titleEl.classList.add('primary-line')
        titleEl.title = item.name
        leftBlock.appendChild(titleEl)

        const query = this.selectListView.getQuery()
        this.highlightMatchesInElement(item.displayName, query, titleEl)

        if (selected) {
          let secondaryEl = document.createElement('div')
          secondaryEl.classList.add('secondary-line')
          secondaryEl.style.display = 'flex'

          if (typeof item.description === 'string') {
            secondaryEl.appendChild(this.createDescription(item.description, query))
          }

          if (Array.isArray(item.tags)) {
            const matchingTags = item.tags
              .map(t => [t, this.fuzz.score(t, query)])
              .filter(([t, s]) => s > 0)
              .sort((a, b) => a.s - b.s)
              .map(([t, s]) => t)

            if (matchingTags.length > 0) {
              secondaryEl.appendChild(this.createTags(matchingTags, query))
            }
          }

          leftBlock.appendChild(secondaryEl)
        }

        li.appendChild(leftBlock)
        return li
      },
      // atom-taito-cli
      didConfirmSelection: (item) => {
        this.hide()
        const directory = atom.project.getPaths()[0];
        const command = item.taitoCommand
          ? `taito ${item.displayName}`
          : `${item.displayName}`
        const execute = item.displayName.indexOf('[') == -1;
        // TODO configurable choice of terminal
        asyncExec(`osascript \
          -e 'tell application "iTerm2"' \
          -e 'tell current session of current window' \
          -e 'write text "cd ${directory} && ${command}" \
              ${execute ? '' : 'newline NO'}' \
          -e 'end tell' \
          -e 'end tell'
        `)
      },
      didCancelSelection: () => {
        this.hide()
      }
    })
    // atom-taito-cli
    this.selectListView.element.classList.add('atom-taito-cli')
  }

  async destroy () {
    await this.selectListView.destroy()
  }

  toggle () {
    if (this.panel && this.panel.isVisible()) {
      this.hide()
      return Promise.resolve()
    } else {
      return this.show()
    }
  }

  async show (showHiddenCommands = false) {
    if (!this.panel) {
      this.panel = atom.workspace.addModalPanel({item: this.selectListView})
    }

    if (!this.preserveLastSearch) {
      this.selectListView.reset()
    } else {
      this.selectListView.refs.queryEditor.selectAll()
    }

    this.activeElement = (document.activeElement === document.body) ? atom.views.getView(atom.workspace) : document.activeElement
    this.keyBindingsForActiveElement = atom.keymaps.findKeyBindings({target: this.activeElement})

    // atom-taito-cli
    // TODO make additional commands configurable
    // TODO copy specs from command-palette
    const commands = await asyncExec('taito --print-commands');
    const commandsForActiveElement = commands.split(/\r?\n/).map(c => {
      return {
        displayName: c.trim(),
        taitoCommand: true
      };
    }).concat([
      { displayName: 'git pull --rebase' },
      { displayName: 'git push' },
    ]).sort((a, b) => a.displayName.localeCompare(b.displayName))

    await this.selectListView.update({items: commandsForActiveElement})

    this.previouslyFocusedElement = document.activeElement
    this.panel.show()
    this.selectListView.focus()
  }

  hide () {
    this.panel.hide()
    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus()
      this.previouslyFocusedElement = null
    }
  }

  async update (props) {
    if (props.hasOwnProperty('preserveLastSearch')) {
      this.preserveLastSearch = props.preserveLastSearch
    }

    if (props.hasOwnProperty('useAlternateScoring')) {
      this.useAlternateScoring = props.useAlternateScoring
    }
  }

  get fuzz () {
    return this.useAlternateScoring ? fuzzaldrinPlus : fuzzaldrin
  }

  highlightMatchesInElement (text, query, el) {
    const matches = this.fuzz.match(text, query)
    let matchedChars = []
    let lastIndex = 0
    for (const matchIndex of matches) {
      const unmatched = text.substring(lastIndex, matchIndex)
      if (unmatched) {
        if (matchedChars.length > 0) {
          const matchSpan = document.createElement('span')
          matchSpan.classList.add('character-match')
          matchSpan.textContent = matchedChars.join('')
          el.appendChild(matchSpan)
          matchedChars = []
        }

        el.appendChild(document.createTextNode(unmatched))
      }

      matchedChars.push(text[matchIndex])
      lastIndex = matchIndex + 1
    }

    if (matchedChars.length > 0) {
      const matchSpan = document.createElement('span')
      matchSpan.classList.add('character-match')
      matchSpan.textContent = matchedChars.join('')
      el.appendChild(matchSpan)
    }

    const unmatched = text.substring(lastIndex)
    if (unmatched) {
      el.appendChild(document.createTextNode(unmatched))
    }
  }

  filter = (items, query) => {
    if (query.length === 0) {
      return items
    }

    const scoredItems = []
    for (const item of items) {
      let score = this.fuzz.score(item.displayName, query)
      if (item.tags) {
        score += item.tags.reduce(
          (currentScore, tag) => currentScore + this.fuzz.score(tag, query),
          0
        )
      }
      if (item.description) {
        score += this.fuzz.score(item.description, query)
      }

      if (score > 0) {
        scoredItems.push({item, score})
      }
    }
    scoredItems.sort((a, b) => b.score - a.score)
    return scoredItems.map((i) => i.item)
  }

  createDescription (description, query) {
    const descriptionEl = document.createElement('div')

    // in case of overflow, give full contents on long hover
    descriptionEl.title = description

    Object.assign(descriptionEl.style, {
      flexGrow: 1,
      flexShrink: 1,
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      overflow: 'hidden'
    })
    this.highlightMatchesInElement(description, query, descriptionEl)
    return descriptionEl
  }

  createTag (tagText, query) {
    const tagEl = document.createElement('li')
    Object.assign(tagEl.style, {
      borderBottom: 0,
      display: 'inline',
      padding: 0
    })
    this.highlightMatchesInElement(tagText, query, tagEl)
    return tagEl
  }

  createTags (matchingTags, query) {
    const tagsEl = document.createElement('ol')
    Object.assign(tagsEl.style, {
      display: 'inline',
      marginLeft: '4px',
      flexShrink: 0,
      padding: 0
    })

    const introEl = document.createElement('strong')
    introEl.textContent = 'matching tags: '

    tagsEl.appendChild(introEl)
    matchingTags.map(t => this.createTag(t, query)).forEach((tagEl, i) => {
      tagsEl.appendChild(tagEl)
      if (i < matchingTags.length - 1) {
        const commaSpace = document.createElement('span')
        commaSpace.textContent = ', '
        tagsEl.appendChild(commaSpace)
      }
    })
    return tagsEl
  }
}